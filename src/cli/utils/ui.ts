export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

export const symbols = {
  ok: "✅",
  fail: "❌",
  skip: "⚠️",
  dot: "·",
};

export function colorBool(ok: boolean, text: string): string {
  return ok ? `${colors.green}${text}${colors.reset}` : `${colors.red}${text}${colors.reset}`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, " ");
  return `${m}m ${rem}s`;
}

export function headline(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

export function note(text: string): string {
  return `${colors.gray}${text}${colors.reset}`;
}
