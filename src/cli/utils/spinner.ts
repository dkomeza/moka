import { fmtDuration } from "./ui.ts";

type SpinnerOpts = {
  text?: string;
  interval?: number;
  enabled?: boolean;
};

export type Spinner = {
  start: () => void;
  stop: () => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
  setText: (text: string) => void;
  isActive: boolean;
};

const defaultFrames = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
];

export function createSpinner(opts: SpinnerOpts = {}): Spinner {
  const canAnimate =
    typeof process.stdout.isTTY === "boolean" &&
    process.stdout.isTTY &&
    !process.env.CI;

  const enabled =
    opts.enabled ?? canAnimate; // auto-disable on CI / non-TTY

  let text = opts.text ?? "Running tests";
  let timer: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let startTime = 0;

  const interval = Math.max(60, opts.interval ?? 80);

  const render = (line: string) => {
    process.stdout.write(`\x1b[2K\r${line}`);
  };

  const clearLine = () => {
    process.stdout.write("\x1b[2K\r");
  };

  const tick = () => {
    const elapsed = fmtDuration(Date.now() - startTime);
    const display = `${defaultFrames[frame]} ${text} ${elapsed}`;
    frame = (frame + 1) % defaultFrames.length;
    render(display);
  };

  const start = () => {
    if (!enabled || timer) return;
    startTime = Date.now();
    timer = setInterval(tick, interval);
    tick();
  };

  const stop = () => {
    if (!enabled) return;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    clearLine();
  };

  const succeed = (msg?: string) => {
    stop();
    if (msg) process.stdout.write(`${msg}\n`);
  };

  const fail = (msg?: string) => {
    stop();
    if (msg) process.stdout.write(`${msg}\n`);
  };

  const setText = (t: string) => {
    text = t;
  };

  return {
    start,
    stop,
    succeed,
    fail,
    setText,
    get isActive() {
      return !!timer;
    },
  };
}
