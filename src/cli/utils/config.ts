import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type MokaConfig = {
  gradleCommand?: string;
  projectDir?: string;
  junitResultsDir?: string;
  coverageReport?: string; // new
};

export function loadConfig(cwd = process.cwd()): MokaConfig {
  const candidates = [".mokarc.json", ".mokarc"];
  for (const name of candidates) {
    const p = join(cwd, name);
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf8");
        return JSON.parse(raw) as MokaConfig;
      } catch {
        // ignore malformed config
      }
    }
  }
  return {};
}
