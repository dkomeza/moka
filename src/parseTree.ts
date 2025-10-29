import type { Package } from "./printTree.ts";

/**
 * Builds the complete coverage package tree from parsed JaCoCo-like data.
 */
export function buildPackageTree(packages: any[]): Package {
    const root: Package = {
        name: "All files",
        fullName: "",
        sourcefile: [],
        children: new Map(),
    };

    for (const pkg of packages) {
        const parts = pkg["@_name"].split("/");
        let current = root;
        let path = "";

        for (const part of parts) {
            path = path ? `${path}/${part}` : part;
            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    fullName: path,
                    sourcefile: [],
                    children: new Map(),
                });
            }
            current = current.children.get(part)!;
        }
        if (pkg.sourcefile) {
            current.sourcefile = pkg.sourcefile.map((sf: any) => {
                const counters = sf.counter ?? [];
                const lineCounter = counters.find((x: any) => x["@_type"] === "LINE");
                const methodCounter = counters.find((x: any) => x["@_type"] === "METHOD");

                const linesCovered = lineCounter ? +lineCounter["@_covered"] : 0;
                const linesMissed = lineCounter ? +lineCounter["@_missed"] : 0;
                const funcsCovered = methodCounter ? +methodCounter["@_covered"] : 0;
                const funcsMissed = methodCounter ? +methodCounter["@_missed"] : 0;

                // Extract uncovered lines from <line> entries
                const lineEntries = Array.isArray(sf.line) ? sf.line : sf.line ? [sf.line] : [];
                const uncoveredLines = lineEntries
                    .filter((l: any) => {
                        const mi = +l["@_mi"];
                        const ci = +l["@_ci"];
                        const mb = +l["@_mb"];
                        const cb = +l["@_cb"];
                        return (mi + mb > 0) && (ci + cb === 0);
                    })
                    .map((l: any) => +l["@_nr"]);

                return {
                    name: sf["@_name"],
                    linesCovered,
                    linesMissed,
                    funcsCovered,
                    funcsMissed,
                    uncoveredLines,
                };
            });
        }
    }

    aggregateCoverage(root);
    return root;
}

/**
 * Aggregates coverage metrics up the tree recursively.
 */
export function aggregateCoverage(pkg: Package): void {
    let totalLinesCovered = 0;
    let totalLinesMissed = 0;
    let totalFuncsCovered = 0;
    let totalFuncsMissed = 0;

    for (const child of pkg.children.values()) {
        aggregateCoverage(child);
        totalLinesCovered += child.linesCovered ?? 0;
        totalLinesMissed += child.linesMissed ?? 0;
        totalFuncsCovered += child.funcsCovered ?? 0;
        totalFuncsMissed += child.funcsMissed ?? 0;
    }

    for (const f of pkg.sourcefile) {
        totalLinesCovered += f.linesCovered;
        totalLinesMissed += f.linesMissed;
        totalFuncsCovered += f.funcsCovered;
        totalFuncsMissed += f.funcsMissed;
    }

    pkg.linesCovered = totalLinesCovered;
    pkg.linesMissed = totalLinesMissed;
    pkg.funcsCovered = totalFuncsCovered;
    pkg.funcsMissed = totalFuncsMissed;
}
