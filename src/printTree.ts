// ANSI color helpers
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

// Shared types
export type SourceFile = {
  name: string;
  linesCovered: number;
  linesMissed: number;
  funcsCovered: number;
  funcsMissed: number;
  uncoveredLines: number[];
};

export type Package = {
  name: string;
  fullName: string;
  sourcefile: SourceFile[];
  children: Map<string, Package>;
  linesCovered?: number;
  linesMissed?: number;
  funcsCovered?: number;
  funcsMissed?: number;
};

// Helpers
function pct(cov: number, miss: number): number {
  const total = cov + miss;
  if (total === 0) return 0;
  return Math.round((cov / total) * 100);
}

function compressLines(lines: number[]): string {
  if (lines.length === 0) return "";
  const ranges: string[] = [];
  let start = lines[0];
  let end = lines[0];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === end + 1) end = lines[i];
    else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = lines[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(",");
}

function colorByCoverage(p: number, text: string): string {
  if (p >= 80) return `${colors.green}${text}${colors.reset}`;
  if (p >= 50) return `${colors.yellow}${text}${colors.reset}`;
  return `${colors.red}${text}${colors.reset}`;
}

// Internal recursive function
function buildCoverageTree(
  pkg: Package,
  prefix = "",
  isLast = true,
  isRoot = true
): string {
  const branch = isRoot ? "" : isLast ? "└── " : "├── ";
  const childPrefix = prefix + (isRoot ? "" : isLast ? "    " : "│   ");

  const fPct = pct(pkg.funcsCovered ?? 0, pkg.funcsMissed ?? 0);
  const lPct = pct(pkg.linesCovered ?? 0, pkg.linesMissed ?? 0);

  const pkgLabel = `${colors.bold}${pkg.name}${colors.reset}`;
  const details = `(${colorByCoverage(fPct, `${fPct}%`)}, ${colorByCoverage(
    lPct,
    `${lPct}%`
  )})`;

  let output = `${prefix}${branch}${pkgLabel} ${details}\n`;

  // Source files
  pkg.sourcefile.forEach((sf, i) => {
    const isFileLast =
      i === pkg.sourcefile.length - 1 && pkg.children.size === 0;
    const sfBranch = isFileLast ? "└── " : "├── ";

    const fPct = pct(sf.funcsCovered, sf.funcsMissed);
    const lPct = pct(sf.linesCovered, sf.linesMissed);
    const uncovered = compressLines(sf.uncoveredLines);

    const fColor = colorByCoverage(fPct, `${fPct}%`);
    const lColor = colorByCoverage(lPct, `${lPct}%`);

    const fileLabel = `${colors.dim}${sf.name}${colors.reset}`;
    const fileDetails =
      uncovered && (fPct < 100 || lPct < 100)
        ? `(${fColor}, ${lColor}, ${uncovered})`
        : `(${fColor}, ${lColor})`;

    output += `${childPrefix}${sfBranch}${fileLabel} ${fileDetails}\n`;
  });

  // Child packages
  const childEntries = Array.from(pkg.children.values());
  childEntries.forEach((child, index) => {
    output += buildCoverageTree(
      child,
      childPrefix,
      index === childEntries.length - 1,
      false
    );
  });

  return output;
}

// Public entry point
export function printCoverageTree(root: Package): void {
  console.log(
    `${colors.bold}Coverage Tree${colors.reset}\n` +
      `${colors.gray}Legend:${colors.reset} (Funcs%, Lines%, Uncovered lines)\n` +
      `${colors.green}High ≥ 80%${colors.reset}, ` +
      `${colors.yellow}Medium 50–79%${colors.reset}, ` +
      `${colors.red}Low < 50%${colors.reset}\n`
  );
  console.log(buildCoverageTree(root));
}
