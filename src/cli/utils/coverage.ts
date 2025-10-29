import { readFileSync, existsSync } from "fs";
import { XMLParser } from "fast-xml-parser";
import { colors } from "./ui.ts";
import { join } from "path";

export type SourceFile = {
  name: string;
  linesCovered: number;
  linesMissed: number;
  funcsCovered: number;
  funcsMissed: number;
  uncoveredLines: number[];
};

export type PackageNode = {
  name: string;
  fullName: string;
  sourcefile: SourceFile[];
  children: Map<string, PackageNode>;
  linesCovered?: number;
  linesMissed?: number;
  funcsCovered?: number;
  funcsMissed?: number;
};

export type UncoveredMode = "auto" | "all" | "none";

function pctInt(covered: number, missed: number): number {
  const total = covered + missed;
  return total === 0 ? 0 : Math.round((covered / total) * 100);
}

function compressLines(lines: number[]): string {
  if (lines.length === 0) return "";
  const out: string[] = [];
  let s = lines[0],
    e = lines[0];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i];
    if (v === e + 1) e = v;
    else {
      out.push(s === e ? `${s}` : `${s}-${e}`);
      s = e = v;
    }
  }
  out.push(s === e ? `${s}` : `${s}-${e}`);
  return out.join(",");
}

function colorByCoverage(p: number, text: string): string {
  if (p >= 80) return `${colors.green}${text}${colors.reset}`;
  if (p >= 50) return `${colors.yellow}${text}${colors.reset}`;
  return `${colors.red}${text}${colors.reset}`;
}

export function printCoverageTree(
  root: PackageNode,
  options?: { uncovered?: UncoveredMode }
): void {
  const uncoveredMode = options?.uncovered ?? "auto";
  console.log(
    `${colors.bold}Coverage Tree${colors.reset}\n` +
      `${colors.gray}Legend:${colors.reset} (Funcs%, Lines%, Uncovered lines)\n` +
      `${colors.green}High ≥ 80%${colors.reset}, ` +
      `${colors.yellow}Medium 50–79%${colors.reset}, ` +
      `${colors.red}Low < 50%${colors.reset}\n`
  );
  process.stdout.write(
    renderPkg(root, "", true, true, { uncoveredMode })
  );
}

function renderPkg(
  pkg: PackageNode,
  prefix = "",
  isLast = true,
  isRoot = true,
  opts: { uncoveredMode: UncoveredMode }
): string {
  const branch = isRoot ? "" : isLast ? "└── " : "├── ";
  const childPrefix = prefix + (isRoot ? "" : isLast ? "    " : "│   ");

  const f = pctInt(pkg.funcsCovered ?? 0, pkg.funcsMissed ?? 0);
  const l = pctInt(pkg.linesCovered ?? 0, pkg.linesMissed ?? 0);

  let out = "";
  const label = isRoot
    ? `${colors.bold}${pkg.name}${colors.reset}`
    : pkg.name;
  out += `${prefix}${branch}${label} (` +
    `${colorByCoverage(f, `${f}%`)}, ${colorByCoverage(
      l,
      `${l}%`
    )})\n`;

  // files
  const files = pkg.sourcefile;
  for (let i = 0; i < files.length; i++) {
    const sf = files[i];
    const isFileLast =
      i === files.length - 1 && pkg.children.size === 0;
    const fb = isFileLast ? "└── " : "├── ";

    const ff = pctInt(sf.funcsCovered, sf.funcsMissed);
    const fl = pctInt(sf.linesCovered, sf.linesMissed);
    const fColor = colorByCoverage(ff, `${ff}%`);
    const lColor = colorByCoverage(fl, `${fl}%`);
    const showUncovered =
      opts.uncoveredMode === "all" ||
      (opts.uncoveredMode === "auto" && (ff < 100 || fl < 100));
    const uncovered =
      showUncovered && sf.uncoveredLines.length
        ? `, ${compressLines(sf.uncoveredLines)}`
        : "";
    out += `${childPrefix}${fb}${colors.dim}${sf.name}${colors.reset} ` +
      `(${fColor}, ${lColor}${uncovered})\n`;
  }

  // children
  const children = Array.from(pkg.children.values());
  for (let i = 0; i < children.length; i++) {
    out += renderPkg(
      children[i],
      childPrefix,
      i === children.length - 1,
      false,
      opts
    );
  }

  return out;
}

export function buildCoverageTreeFromJaCoCo(
  xmlPath: string
): PackageNode | null {
  if (!existsSync(xmlPath)) return null;
  const xml = readFileSync(xmlPath, "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      ["package", "sourcefile", "line", "counter", "class"].includes(
        name
      ),
  });
  const data = parser.parse(xml);
  const pkgs: any[] = ensureArray(data?.report?.package);
  if (!pkgs.length) return null;

  const root: PackageNode = {
    name: "All files",
    fullName: "",
    sourcefile: [],
    children: new Map(),
  };

  for (const pkg of pkgs) {
    const pkgName = (pkg["@_name"] ?? "").replace(/\./g, "/");
    const parts = pkgName ? pkgName.split("/") : [];
    let cur = root;
    let path = "";

    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!cur.children.has(part)) {
        cur.children.set(part, {
          name: part,
          fullName: path,
          sourcefile: [],
          children: new Map(),
        });
      }
      cur = cur.children.get(part)!;
    }

    const sourcefiles = ensureArray(pkg.sourcefile);
    if (sourcefiles.length > 0) {
      for (const sf of sourcefiles) {
        const name = sf["@_name"] ?? "unknown";
        const counters = ensureArray(sf.counter);
        const lineCounter = counters.find(
          (c) => c["@_type"] === "LINE"
        );
        const methodCounter = counters.find(
          (c) => c["@_type"] === "METHOD"
        );
        const linesCovered = +(lineCounter?.["@_covered"] ?? 0);
        const linesMissed = +(lineCounter?.["@_missed"] ?? 0);
        const funcsCovered = +(methodCounter?.["@_covered"] ?? 0);
        const funcsMissed = +(methodCounter?.["@_missed"] ?? 0);

        const lineEntries = ensureArray(sf.line);
        const uncoveredLines = lineEntries
          .filter((l) => {
            const mi = +(l?.["@_mi"] ?? 0);
            const ci = +(l?.["@_ci"] ?? 0);
            const mb = +(l?.["@_mb"] ?? 0);
            const cb = +(l?.["@_cb"] ?? 0);
            // Executable (instr or branch) and none covered
            return mi + mb > 0 && ci + cb === 0;
          })
          .map((l) => +l["@_nr"])
          .sort((a, b) => a - b);

        cur.sourcefile.push({
          name,
          linesCovered,
          linesMissed,
          funcsCovered,
          funcsMissed,
          uncoveredLines,
        });
      }
    } else {
      // Fallback via <class> counters, grouped by sourcefilename
      const classes = ensureArray(pkg.class);
      const grouped = new Map<
        string,
        {
          linesCovered: number;
          linesMissed: number;
          funcsCovered: number;
          funcsMissed: number;
        }
      >();
      for (const c of classes) {
        const sfname = c["@_sourcefilename"] ?? "unknown";
        const counters = ensureArray(c.counter);
        const lineCounter = counters.find(
          (x) => x["@_type"] === "LINE"
        );
        const methodCounter = counters.find(
          (x) => x["@_type"] === "METHOD"
        );
        const g =
          grouped.get(sfname) ??
          {
            linesCovered: 0,
            linesMissed: 0,
            funcsCovered: 0,
            funcsMissed: 0,
          };
        g.linesCovered += +(lineCounter?.["@_covered"] ?? 0);
        g.linesMissed += +(lineCounter?.["@_missed"] ?? 0);
        g.funcsCovered += +(methodCounter?.["@_covered"] ?? 0);
        g.funcsMissed += +(methodCounter?.["@_missed"] ?? 0);
        grouped.set(sfname, g);
      }
      for (const [name, g] of grouped) {
        cur.sourcefile.push({
          name,
          ...g,
          uncoveredLines: [],
        });
      }
    }

    // Optional: sort files for consistency
    cur.sourcefile.sort((a, b) => a.name.localeCompare(b.name));
  }

  aggregateCoverage(root);
  return root;
}

function aggregateCoverage(pkg: PackageNode) {
  let lc = 0,
    lm = 0,
    fc = 0,
    fm = 0;

  for (const child of pkg.children.values()) {
    aggregateCoverage(child);
    lc += child.linesCovered ?? 0;
    lm += child.linesMissed ?? 0;
    fc += child.funcsCovered ?? 0;
    fm += child.funcsMissed ?? 0;
  }
  for (const f of pkg.sourcefile) {
    lc += f.linesCovered;
    lm += f.linesMissed;
    fc += f.funcsCovered;
    fm += f.funcsMissed;
  }
  pkg.linesCovered = lc;
  pkg.linesMissed = lm;
  pkg.funcsCovered = fc;
  pkg.funcsMissed = fm;

  // stable order
  pkg.children = new Map(
    Array.from(pkg.children.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
  );
}

export function detectDefaultCoveragePath(
  cwd: string
): string | null {
  const candidates = [
    // Gradle
    join(cwd, "build", "reports", "jacoco", "test", "jacocoTestReport.xml"),
    join(cwd, "build", "reports", "jacoco", "jacocoTestReport.xml"),
    // Maven
    join(cwd, "target", "site", "jacoco", "jacoco.xml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Prefer Gradle default as fallback
  return candidates[0];
}

function ensureArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
