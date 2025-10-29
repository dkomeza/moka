import { detectGradleCmd, runCmd } from "../utils/process.ts";
import {
  colors,
  headline,
  fmtDuration,
  note,
  colorBool,
} from "../utils/ui.ts";
import { createSpinner } from "../utils/spinner.ts";
import { loadConfig, type MokaConfig } from "../utils/config.ts";
import { parseJUnitDir } from "../utils/junit.ts";
import { buildTestsTree, printTestsTree } from "../utils/testsTree.ts";
import { join } from "path";
import { existsSync } from "fs";
import { cmdCoverage } from "./coverage.ts";
import type { UncoveredMode } from "../utils/coverage.ts";

export type TestOptions = {
  patterns: string[];
  cwd: string;
  gradle?: string;
  quiet?: boolean;
  verbose?: boolean;
  showTree?: boolean;
  includeTests?: boolean;
  failuresOnly?: boolean;
  noSpinner?: boolean;
  coverage?: boolean;
  minLines?: number;
  minFuncs?: number;
  uncovered?: UncoveredMode;
};

export async function cmdTest(argv: string[]): Promise<number> {
  const { patterns, opts } = parseArgs(argv);
  const cfg = loadConfig(opts.cwd);

  const cwd = opts.cwd;
  const gradle =
    opts.gradle || cfg.gradleCommand || detectGradleCmd(cwd);

  const junitDir =
    resolveJUnitDir(cfg, cwd) ||
    join(cwd, "build", "test-results", "test");

  console.log(headline("Moka • Gradle Test Runner"));
  console.log(
    `${note("project:")} ${cwd}\n${note("gradle: ")} ${gradle}\n`
  );

  const args = [
    "test",
    "--no-daemon",
    ...(!opts.verbose
      ? ["--console=plain", "--warning-mode=none", "-q"]
      : []),
    ...patterns.flatMap((p) => ["--tests", p]),
  ];

  console.log(
    `${colors.gray}$ ${gradle} ${args.join(" ")}${colors.reset}\n`
  );

  const spinner =
    !opts.verbose && !opts.noSpinner
      ? createSpinner({ text: "Running Gradle tests" })
      : null;

  try {
    spinner?.start();
    const { code: testCode, durationMs } = await runCmd(gradle, args, {
      cwd,
      inherit: opts.verbose ? true : false,
      forwardOutput: opts.verbose ? true : false, // default: silent
      suppressJvmNativeWarning: true, // hide JDK native-access warnings
    });
    spinner?.stop();
    // JUnit summary
    const summary = parseJUnitDir(junitDir);
    printSummary(summary, durationMs, testCode);

    // Optional test tree
    if (opts.showTree) {
      const tree = buildTestsTree(junitDir);
      if (tree) {
        printTestsTree(tree, {
          includeTests: !!opts.includeTests,
          failuresOnly: !!opts.failuresOnly,
        });
      } else {
        console.log(
          `${colors.gray}No JUnit XML found at:${colors.reset} ${junitDir}`
        );
      }
    }

    let finalCode = testCode;

    // Optional coverage after tests
    if (opts.coverage) {
      const covArgs: string[] = ["--run", "--cwd", opts.cwd];
      if (opts.verbose) covArgs.push("--verbose");
      if (opts.noSpinner) covArgs.push("--no-spinner");
      if (opts.gradle) covArgs.push("--gradle", opts.gradle);
      if (opts.minLines != null)
        covArgs.push("--min-lines", String(opts.minLines));
      if (opts.minFuncs != null)
        covArgs.push("--min-funcs", String(opts.minFuncs));
      if (opts.uncovered)
        covArgs.push("--uncovered", String(opts.uncovered));

      const covCode = await cmdCoverage(covArgs);
      if (covCode !== 0) finalCode = covCode;
    }

    return finalCode;
  } finally {
    spinner?.stop();
  }
}

function parseArgs(argv: string[]) {
  const patterns: string[] = [];
  let gradle: string | undefined;
  let quiet = false;
  let verbose = false;
  let cwd = process.cwd();
  let showTree = false;
  let includeTests = false;
  let failuresOnly = false;
  let noSpinner = false;
  let wantCoverage = false;
  let minLines: number | undefined;
  let minFuncs: number | undefined;
  let uncovered: "auto" | "all" | "none" = "auto";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] || "";
    if (a === "--gradle" && argv[i + 1]) {
      gradle = argv[++i];
    } else if (a === "--cwd" && argv[i + 1]) {
      cwd = argv[++i] || "";
    } else if (a === "--quiet" || a === "-q") {
      quiet = true;
    } else if (a === "--verbose" || a === "-v") {
      verbose = true;
    } else if (a === "--tree") {
      showTree = true;
      includeTests = false;
      const maybe = argv[i + 1];
      if (maybe && !maybe.startsWith("-")) {
        i++;
        if (maybe === "tests") includeTests = true;
      }
    } else if (a.startsWith("--tree=")) {
      showTree = true;
      includeTests = a.split("=")[1] === "tests";
    } else if (a === "--tests") {
      showTree = true;
      includeTests = true;
    } else if (a === "--failures-only") {
      failuresOnly = true;
      showTree = true;
    } else if (!a.startsWith("-")) {
      patterns.push(a);
    } else if (a === "--no-spinner") {
      noSpinner = true;
    } else if (a === "--coverage") {
      wantCoverage = true;
    } else if (a === "--min-lines" && argv[i + 1]) {
      minLines = +argv[++i]!;
    } else if (a === "--min-funcs" && argv[i + 1]) {
      minFuncs = +argv[++i]!;
    } else if (a.startsWith("--uncovered=")) {
      const v = a.split("=")[1] as any;
      if (v === "auto" || v === "all" || v === "none") uncovered = v;
    }
  }

  return {
    patterns,
    opts: {
      gradle,
      quiet,
      verbose,
      cwd,
      showTree,
      includeTests,
      failuresOnly,
      noSpinner,
      coverage: wantCoverage,
      minLines,
      minFuncs,
      uncovered,
    } as TestOptions,
  };
}

function resolveJUnitDir(cfg: MokaConfig, cwd: string): string | null {
  if (cfg.junitResultsDir) return join(cwd, cfg.junitResultsDir);
  const gradleDir = join(cwd, "build", "test-results", "test");
  if (existsSync(gradleDir)) return gradleDir;
  return gradleDir;
}

function printSummary(
  s: ReturnType<typeof parseJUnitDir>,
  durationMs: number,
  code: number
) {
  console.log("");
  if (!s) {
    const ok = code === 0;
    console.log(
      `${colorBool(ok, ok ? "SUCCESS" : "FAILED")} ${note(
        `(${fmtDuration(durationMs)})`
      )}`
    );
    if (!ok) {
      console.log(`${colors.red}Some tests failed.${colors.reset}`);
    }
    return;
  }

  const passed = Math.max(0, s.tests - s.failures - s.errors - s.skipped);
  const ok = code === 0 && s.failures === 0 && s.errors === 0;

  const parts = [
    `${colors.bold}${s.tests}${colors.reset} tests`,
    `${colors.green}${passed}${colors.reset} passed`,
  ];
  if (s.failures > 0)
    parts.push(`${colors.red}${s.failures}${colors.reset} failed`);
  if (s.errors > 0)
    parts.push(`${colors.red}${s.errors}${colors.reset} errors`);
  if (s.skipped > 0)
    parts.push(`${colors.yellow}${s.skipped}${colors.reset} skipped`);

  console.log(parts.join("  ·  ") + `   ${note(fmtDuration(durationMs))}`);
  console.log(
    ok
      ? `${colors.green}${colors.bold}BUILD SUCCESSFUL${colors.reset}`
      : `${colors.red}${colors.bold}BUILD FAILED${colors.reset}`
  );
}
