#!/usr/bin/env bun
import { cmdTest } from "./commands/test.ts";
import { cmdCoverage } from "./commands/coverage.ts";
import { colors, headline } from "./utils/ui.ts";

async function main() {
  const [, , sub = "test", ...rest] = process.argv;

  if (sub === "help" || sub === "--help" || sub === "-h") {
    printHelp();
    process.exit(0);
  }

  if (sub === "version" || sub === "--version" || sub === "-v") {
    printVersion();
    process.exit(0);
  }

  if (sub === "test") {
    const code = await cmdTest(rest);
    process.exit(code);
  }

  if (sub === "coverage") {
    const code = await cmdCoverage(rest);
    process.exit(code);
  }

  // Default: treat unknown subcommand as pattern for test
  const code = await cmdTest([sub, ...rest]);
  process.exit(code);
}

function printHelp() {
  console.log(
    `${headline("moka — Gradle test runner")}

Usage:
  moka test [patterns...] [--coverage] [--tree[=tests]] [--failures-only]
            [--gradle <cmd>] [--cwd <dir>] [--verbose] [--no-spinner]
            [--min-lines <n>] [--min-funcs <n>] [--uncovered auto|all|none]

  moka coverage [path?] [--run] [--gradle <cmd>] [--cwd <dir>]
                [--verbose] [--no-spinner]
                [--min-lines <n>] [--min-funcs <n>] [--uncovered auto|all|none]

Examples:
  moka test --coverage
  moka coverage --run
  moka coverage ./build/reports/jacoco/test/jacocoTestReport.xml
`
  );
}

function printVersion() {
  console.log("moka v0.2.0");
}

main().catch((err) => {
  console.error(`${colors.red}Unexpected error:${colors.reset}`, err);
  process.exit(1);
});
