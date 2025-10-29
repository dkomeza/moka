import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "fs";
import { join } from "path";
import { XMLParser } from "fast-xml-parser";
import { colors } from "./ui.ts";

export type TestStatus = "passed" | "failed" | "skipped";

export type TestCaseNode = {
  name: string;
  durationMs: number;
  status: TestStatus;
  failureMessage?: string;
  failureType?: string;
  failureDetail?: string;
};

export type TestClassNode = {
  name: string;
  fullName: string;
  cases: TestCaseNode[];
  counts: Counts;
  durationMs: number;
};

type Counts = { passed: number; failed: number; skipped: number };

export type TestPackageNode = {
  name: string;
  fullName: string;
  children: Map<string, TestPackageNode>;
  classes: Map<string, TestClassNode>;
  counts: Counts;
  durationMs: number;
};

export type TestTreeOptions = {
  includeTests?: boolean;
  failuresOnly?: boolean;
};

export function buildTestsTree(
  dir: string
): TestPackageNode | null {
  if (!existsSync(dir)) return null;

  const root: TestPackageNode = {
    name: "All tests",
    fullName: "",
    children: new Map(),
    classes: new Map(),
    counts: { passed: 0, failed: 0, skipped: 0 },
    durationMs: 0,
  };

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const files = readdirSync(dir).filter((f) =>
    f.endsWith(".xml")
  );

  for (const f of files) {
    const p = join(dir, f);
    if (!statSync(p).isFile()) continue;

    let data: any;
    try {
      data = parser.parse(readFileSync(p, "utf8"));
    } catch {
      continue;
    }

    const suites: any[] = normalizeSuites(data);
    for (const s of suites) {
      const cases = normalizeCases(s);
      for (const tc of cases) {
        const name = tc["@_name"] ?? "unknown";
        const timeSec = +tc["@_time"] || 0;
        const classname =
          tc["@_classname"] ||
          s["@_name"] ||
          "unknown.UnknownClass";
        const { pkgPath, className, fullName } =
          splitClassName(classname);

        const status = classify(tc);
        const caseNode: TestCaseNode = {
          name,
          durationMs: Math.round(timeSec * 1000),
          status,
          failureMessage: failureMessage(tc),
          failureType: failureType(tc),
          failureDetail: failureDetail(tc),
        };

        const pkgNode = ensurePackage(root, pkgPath);
        const cls = ensureClass(pkgNode, className, fullName);

        cls.cases.push(caseNode);
      }
    }
  }

  aggregate(root);
  return root;
}

export function printTestsTree(
  root: TestPackageNode,
  opts: TestTreeOptions = {}
): void {
  const text = renderPkg(root, "", true, true, opts);
  console.log(
    `${colors.bold}Test Tree${colors.reset}\n` +
    `${colors.gray}Legend:${colors.reset} (P,F,S, time)\n`
  );
  console.log(text);
}

/* Helpers */

function normalizeSuites(data: any): any[] {
  if (data.testsuite) return [data.testsuite];
  if (data.testsuites?.testsuite) {
    const s = data.testsuites.testsuite;
    return Array.isArray(s) ? s : [s];
  }
  return [];
}

function normalizeCases(suite: any): any[] {
  const t = suite.testcase;
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

function splitClassName(classname: string) {
  const lastDot = classname.lastIndexOf(".");
  if (lastDot === -1) {
    return {
      pkgPath: [],
      className: classname,
      fullName: classname,
    };
  }
  const pkgStr = classname.slice(0, lastDot);
  const className = classname.slice(lastDot + 1);
  return {
    pkgPath: pkgStr.split(".").filter(Boolean),
    className,
    fullName: classname,
  };
}

function classify(tc: any): TestStatus {
  if (tc.failure || tc.error) return "failed";
  if (tc.skipped || tc["@_status"] === "skipped")
    return "skipped";
  return "passed";
}

function failureMessage(tc: any): string | undefined {
  const f = tc.failure || tc.error;
  if (!f) return;
  return f["@_message"];
}

function failureType(tc: any): string | undefined {
  const f = tc.failure || tc.error;
  if (!f) return;
  return f["@_type"];
}

function failureDetail(tc: any): string | undefined {
  const f = tc.failure || tc.error;
  if (!f) return;
  if (typeof f["#text"] === "string") return f["#text"];
  return;
}

function ensurePackage(
  root: TestPackageNode,
  path: string[]
): TestPackageNode {
  let cur = root;
  let full = "";
  for (const part of path) {
    full = full ? `${full}.${part}` : part;
    if (!cur.children.has(part)) {
      cur.children.set(part, {
        name: part,
        fullName: full,
        children: new Map(),
        classes: new Map(),
        counts: { passed: 0, failed: 0, skipped: 0 },
        durationMs: 0,
      });
    }
    cur = cur.children.get(part)!;
  }
  return cur;
}

function ensureClass(
  pkg: TestPackageNode,
  className: string,
  fullName: string
): TestClassNode {
  if (!pkg.classes.has(className)) {
    pkg.classes.set(className, {
      name: className,
      fullName,
      cases: [],
      counts: { passed: 0, failed: 0, skipped: 0 },
      durationMs: 0,
    });
  }
  return pkg.classes.get(className)!;
}

function aggregate(node: TestPackageNode) {
  // classes
  for (const cls of node.classes.values()) {
    let dur = 0;
    const counts = { passed: 0, failed: 0, skipped: 0 };
    for (const c of cls.cases) {
      dur += c.durationMs;
      counts[c.status]++;
    }
    cls.durationMs = dur;
    cls.counts = counts;

    node.durationMs += dur;
    node.counts.passed += counts.passed;
    node.counts.failed += counts.failed;
    node.counts.skipped += counts.skipped;
  }

  // children
  for (const child of node.children.values()) {
    aggregate(child);
    node.durationMs += child.durationMs;
    node.counts.passed += child.counts.passed;
    node.counts.failed += child.counts.failed;
    node.counts.skipped += child.counts.skipped;
  }
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1);
  return `${m}m ${rem}s`;
}

function colorCount(n: number, kind: keyof Counts): string {
  if (kind === "failed")
    return n > 0
      ? `${colors.red}${n}${colors.reset}`
      : `${n}`;
  if (kind === "skipped")
    return n > 0
      ? `${colors.yellow}${n}${colors.reset}`
      : `${n}`;
  return n > 0 ? `${colors.green}${n}${colors.reset}` : `${n}`;
}

function countsLabel(c: Counts): string {
  return `P:${colorCount(c.passed, "passed")},` +
    ` F:${colorCount(c.failed, "failed")},` +
    ` S:${colorCount(c.skipped, "skipped")}`;
}

function renderPkg(
  pkg: TestPackageNode,
  prefix = "",
  isLast = true,
  isRoot = true,
  opts: TestTreeOptions = {}
): string {
  const branch = isRoot ? "" : isLast ? "└── " : "├── ";
  const childPrefix =
    prefix + (isRoot ? "" : isLast ? "    " : "│   ");

  let out = "";
  const label = isRoot
    ? `${colors.bold}${pkg.name}${colors.reset}`
    : pkg.name;
  out += `${prefix}${branch}${label} (` +
    `${countsLabel(pkg.counts)}, ${fmtMs(pkg.durationMs)})\n`;

  // Decide what to show (respect failuresOnly)
  const allClasses = Array.from(pkg.classes.values());
  const classesToShow = opts.failuresOnly
    ? allClasses.filter((c) => c.counts.failed > 0)
    : allClasses;
  const allChildren = Array.from(pkg.children.values());
  const childrenToShow = opts.failuresOnly
    ? allChildren.filter((c) => c.counts.failed > 0)
    : allChildren;

  // classes
  for (let i = 0; i < classesToShow.length; i++) {
    const cls = classesToShow[i];
    const isLastClass =
      i === classesToShow.length - 1 && childrenToShow.length === 0;
    const clsBranch = isLastClass ? "└── " : "├── ";
    out += `${childPrefix}${clsBranch}${cls.name} (` +
      `${countsLabel(cls.counts)}, ${fmtMs(cls.durationMs)})\n`;

    if (opts.includeTests) {
      const testsAll = cls.cases;
      const tests = opts.failuresOnly
        ? testsAll.filter((t) => t.status === "failed")
        : testsAll;
      const testsPrefix =
        childPrefix + (isLastClass ? "    " : "│   ");
      for (let j = 0; j < tests.length; j++) {
        const t = tests[j];
        const isLastTest = j === tests.length - 1;
        const testBranch = isLastTest ? "└── " : "├── ";
        const icon =
          t.status === "passed"
            ? "✅"
            : t.status === "skipped"
              ? "⚠️"
              : "❌";
        const name =
          t.status === "failed"
            ? `${colors.red}${t.name}${colors.reset}`
            : t.status === "skipped"
              ? `${colors.yellow}${t.name}${colors.reset}`
              : `${colors.green}${t.name}${colors.reset}`;
        out += `${testsPrefix}${testBranch}${icon} ${name} ` +
          `(${fmtMs(t.durationMs)})\n`;

        if (t.status === "failed" && t.failureMessage) {
          const detailIndent = testsPrefix + (isLastTest ? "    " : "│   ");
          out += `${detailIndent}- ${colors.red}${t.failureMessage}${colors.reset}\n`;
        }
      }
    }
  }

  // children
  for (let i = 0; i < childrenToShow.length; i++) {
    const child = childrenToShow[i];
    out += renderPkg(
      child,
      childPrefix,
      i === childrenToShow.length - 1,
      false,
      opts
    );
  }

  return out;
}
