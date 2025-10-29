import { existsSync } from "fs";
import { join } from "path";

export type RunResult = {
  code: number;
  durationMs: number;
};

export type RunOptions = {
  cwd?: string;
  inherit?: boolean;
  forwardOutput?: boolean;
  filter?: (text: string, stream: "stdout" | "stderr") => string | null;
  env?: Record<string, string | undefined>;
  suppressJvmNativeWarning?: boolean;
};

export async function runCmd(
  cmd: string,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const start = Date.now();

  // Build env for the child process
  const childEnv: Record<string, string> = {
    ...process.env,
    ...(options.env ?? {}),
  } as Record<string, string>;
  if (options.suppressJvmNativeWarning) {
    const prev = childEnv.JAVA_TOOL_OPTIONS ?? "";
    const flag = "--enable-native-access=ALL-UNNAMED";
    childEnv.JAVA_TOOL_OPTIONS = prev.includes(flag)
      ? prev
      : (prev ? prev + " " : "") + flag;
  }

  const proc = Bun.spawn({
    cmd: [cmd, ...args],
    cwd: options.cwd ?? process.cwd(),
    env: childEnv,
    stdout: options.inherit ? "inherit" : "pipe",
    stderr: options.inherit ? "inherit" : "pipe",
  });

  // Drain or forward output if not inheriting
  const consumes: Promise<void>[] = [];
  if (!options.inherit) {
    const decoder = new TextDecoder();
    const consume = async (
      rs: ReadableStream<Uint8Array> | null,
      which: "stdout" | "stderr"
    ) => {
      if (!rs) return;
      const reader = rs.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        // Silent mode: just drain
        if (!options.forwardOutput && !options.filter) continue;
        const text = decoder.decode(value);
        const toWrite =
          options.filter ? options.filter(text, which) : text;
        if (toWrite != null && options.forwardOutput !== false) {
          if (which === "stdout") process.stdout.write(toWrite);
          else process.stderr.write(toWrite);
        }
      }
    };
    consumes.push(consume(proc.stdout!, "stdout"));
    consumes.push(consume(proc.stderr!, "stderr"));
  }

  const code = await proc.exited;
  await Promise.all(consumes);
  return { code, durationMs: Date.now() - start };
}
 
export function detectGradleCmd(cwd: string): string {
  const wrapper = join(cwd, "gradlew");
  if (existsSync(wrapper)) return wrapper;
  return "gradle";
}
