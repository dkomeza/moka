import { colors, headline, note } from "../utils/ui.ts";
import {
  buildCoverageTreeFromJaCoCo,
  detectDefaultCoveragePath,
  printCoverageTree,
  type UncoveredMode,
} from "../utils/coverage.ts";
import { detectGradleCmd, runCmd } from "../utils/process.ts";
import { createSpinner } from "../utils/spinner.ts";
import { existsSync } from "fs";
import { loadConfig } from "../utils/config.ts";

export type CoverageOptions = {
  path?: string;
  run?: boolean;
  gradle?: string;
  verbose?: boolean;
  noSpinner?: boolean;
  uncovered?: UncoveredMode;
  minLines?: number;
  minFuncs?: number;
  cwd: string;
};

export async function cmdCoverage(
  argv: string[]
): Promise<number> {
  const opts = parseArgs(argv);
  const cfg = loadConfig(opts.cwd);
  const cwd = opts.cwd;

  const gradle =
    opts.gradle || cfg.gradleCommand || detectGradleCmd(cwd);
  const defaultPath =
    opts.path ||
    cfg.coverageReport ||
    detectDefaultCoveragePath(cwd);

  console.log(headline("Moka • Coverage"));
  console.log(
    `${note("project:")} ${cwd}\n${note("report: ")} ${defaultPath}\n`
  );

  // Generate report if asked or not present
  if (opts.run || !existsSync(defaultPath!)) {
    const spinner =
      !opts.verbose && !opts.noSpinner
        ? createSpinner({ text: "Generating coverage report" })
        : null;
    try {
      spinner?.start();
      const args = [
        "jacocoTestReport",
        "--no-daemon",
        ...(!opts.verbose
          ? ["--console=plain", "--warning-mode=none", "-q"]
          : []),
      ];
      const res = await runCmd(gradle, args, {
        cwd,
        inherit: !!opts.verbose,
        forwardOutput: !!opts.verbose,
        suppressJvmNativeWarning: true,
      });
      spinner?.stop();
      if (res.code !== 0) {
        console.error(
          `${colors.red}Gradle jacocoTestReport failed.${colors.reset}`
        );
      }
    } finally {
      spinner?.stop();
    }
  }

  const root = buildCoverageTreeFromJaCoCo(defaultPath!);
  if (!root) {
    console.error(
      `${colors.red}Coverage XML not found or unreadable:${colors.reset} ${defaultPath}`
    );
    return 1;
  }

  printCoverageTree(root, { uncovered: opts.uncovered });

  // thresholds
  const lPct =
    ((root.linesCovered ?? 0) + (root.linesMissed ?? 0)) === 0
      ? 0
      : Math.round(
          ((root.linesCovered ?? 0) /
            ((root.linesCovered ?? 0) + (root.linesMissed ?? 0))) *
            100
        );
  const fPct =
    ((root.funcsCovered ?? 0) + (root.funcsMissed ?? 0)) === 0
      ? 0
      : Math.round(
          ((root.funcsCovered ?? 0) /
            ((root.funcsCovered ?? 0) + (root.funcsMissed ?? 0))) *
            100
        );

  let exitCode = 0;
  if (
    typeof opts.minLines === "number" &&
    lPct < opts.minLines
  ) {
    console.error(
      `${colors.red}Lines coverage ${lPct}% < min ${opts.minLines}%${colors.reset}`
    );
    exitCode = 2;
  }
  if (
    typeof opts.minFuncs === "number" &&
    fPct < opts.minFuncs
  ) {
    console.error(
      `${colors.red}Funcs coverage ${fPct}% < min ${opts.minFuncs}%${colors.reset}`
    );
    exitCode = Math.max(exitCode, 2);
  }

  return exitCode;
}

function parseArgs(argv: string[]): CoverageOptions {
  let path: string | undefined;
  let run = false;
  let gradle: string | undefined;
  let verbose = false;
  let noSpinner = false;
  let uncovered: UncoveredMode = "auto";
  let minLines: number | undefined;
  let minFuncs: number | undefined;
  let cwd = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === "--run") run = true;
    else if (a === "--gradle" && argv[i + 1]) gradle = argv[++i];
    else if (a === "--verbose" || a === "-v") verbose = true;
    else if (a === "--no-spinner") noSpinner = true;
    else if (a === "--cwd" && argv[i + 1]) cwd = argv[++i];
    else if (a.startsWith("--uncovered=")) {
      const v = a.split("=")[1] as UncoveredMode;
      if (v === "auto" || v === "all" || v === "none") uncovered = v;
    } else if (a === "--uncovered" && argv[i + 1]) {
      const v = argv[++i] as UncoveredMode;
      if (v === "auto" || v === "all" || v === "none") uncovered = v;
    } else if (a === "--min-lines" && argv[i + 1]) {
      minLines = +argv[++i];
    } else if (a === "--min-funcs" && argv[i + 1]) {
      minFuncs = +argv[++i];
    } else if (!a.startsWith("-")) {
      path = a;
    }
  }

  return {
    path,
    run,
    gradle,
    verbose,
    noSpinner,
    uncovered,
    minLines,
    minFuncs,
    cwd,
  };
}
