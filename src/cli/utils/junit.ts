import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { XMLParser } from "fast-xml-parser";

export type JUnitSummary = {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
};

export function parseJUnitDir(dir: string): JUnitSummary | null {
  if (!existsSync(dir)) return null;

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let total: JUnitSummary = { tests: 0, failures: 0, errors: 0, skipped: 0 };

  const files = readdirSync(dir).filter((f) => f.endsWith(".xml"));
  for (const f of files) {
    const p = join(dir, f);
    if (!statSync(p).isFile()) continue;
    try {
      const txt = readFileSync(p, "utf8");
      const data = parser.parse(txt);

      // Handle <testsuite> or <testsuites>
      if (data.testsuite && data.testsuite["@_tests"] !== undefined) {
        total = sum(total, readSuiteAttrs(data.testsuite));
      } else if (data.testsuites) {
        const suites = Array.isArray(data.testsuites.testsuite)
          ? data.testsuites.testsuite
          : data.testsuites.testsuite
          ? [data.testsuites.testsuite]
          : [];
        for (const s of suites) total = sum(total, readSuiteAttrs(s));
      }
    } catch {
      // ignore parse errors per file
    }
  }

  return total;

  function sum(a: JUnitSummary, b: JUnitSummary): JUnitSummary {
    return {
      tests: a.tests + b.tests,
      failures: a.failures + b.failures,
      errors: a.errors + b.errors,
      skipped: a.skipped + b.skipped,
    };
  }

  function readSuiteAttrs(s: any): JUnitSummary {
    return {
      tests: +s["@_tests"] || 0,
      failures: +s["@_failures"] || 0,
      errors: +s["@_errors"] || 0,
      skipped: +s["@_skipped"] || +s["@_ignored"] || 0,
    };
  }
}
