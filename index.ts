#!/usr/bin/env node

import { printCoverageTree } from "./src/printTree.js";
import { buildPackageTree } from "./src/parseTree.js";
import { XMLParser } from "fast-xml-parser";
import { readFileSync, existsSync } from "fs";
import { exit } from "process";

const DEFAULT_REPORT_PATH =
  "build/reports/jacoco/test/jacocoTestReport.xml";

const [, , maybePath, ...rest] = process.argv;

// CLI Flags -------------------------------------------------
if (rest.includes("-h") || rest.includes("--help") || maybePath === "-h" || maybePath === "--help") {
  console.log(`
Usage:
  coverage-tree [path-to-jacoco-xml]

Description:
  Displays a tree coverage summary for a JaCoCo XML report.

Options:
  -h, --help    Show help message

When no path is specified, tries: ${DEFAULT_REPORT_PATH}

Examples:
  coverage-tree
  coverage-tree ./data/report.xml
`);
  exit(0);
}

// Determine input path -------------------------------------------------
const inputFile = maybePath || DEFAULT_REPORT_PATH;

if (!existsSync(inputFile)) {
  console.error(`❌ Coverage report not found:
  ${inputFile}

Either generate a JaCoCo XML report, or specify a custom path:
  coverage-tree ./path/to/jacocoTestReport.xml
`);
  exit(1);
}

// Parse and print -------------------------------------------------
try {
  const xml = readFileSync(inputFile, "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["package", "class", "sourcefile"].includes(name),
  });

  const data = parser.parse(xml);
  const packages = data.report.package;

  const tree = buildPackageTree(packages);
  printCoverageTree(tree);
} catch (err) {
  console.error(`❌ Failed to process coverage report: ${(err as Error).message}`);
  exit(1);
}
