/**
 * Metronome Worker (design: "Wake-up Cadence"; Requirements 1.8, 14.1, 16.6).
 *
 * Browsers throttle timers in hidden pages, so the main thread cannot rely on `setTimeout`
 * while the App document is hidden. A dedicated worker is not subject to that throttling and
 * posts a tick at the interval the main thread asks for. The worker holds no state beyond the
 * interval and does no App logic: the main thread (ticker.ts) turns each tick into a
 * schedule evaluation.
 *
 * Created from ticker.ts with `new Worker(new URL('./metronome.worker.ts', import.meta.url),
 * { type: 'module' })`, so Vite emits this file under the base path (Requirement 21.8).
 */

/** Messages the main thread sends to this worker. */
export type MetronomeCommand =
  | { readonly type: 'start'; readonly intervalMs: number }
  | { readonly type: 'stop' };

/** Messages this worker posts back to the main thread. */
export type MetronomeMessage = { readonly type: 'tick' };

/** The part of the dedicated worker global scope that this file uses. */
interface MetronomeScope {
  postMessage(message: MetronomeMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

// The worker file is compiled with the DOM library (the App has one tsconfig), so `self` is
// typed as a window. This narrows it to the members used here.
const scope = self as unknown as MetronomeScope;

let timer: ReturnType<typeof setInterval> | undefined;

function isCommand(value: unknown): value is MetronomeCommand {
  if (typeof value !== 'object' || value === null) return false;
  const command = value as { type?: unknown; intervalMs?: unknown };
  if (command.type === 'stop') return true;
  return (
    command.type === 'start' &&
    typeof command.intervalMs === 'number' &&
    Number.isInteger(command.intervalMs) &&
    command.intervalMs > 0
  );
}

scope.addEventListener('message', (event) => {
  if (!isCommand(event.data)) return;

  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
  if (event.data.type === 'start') {
    const message: MetronomeMessage = { type: 'tick' };
    timer = setInterval(() => scope.postMessage(message), event.data.intervalMs);
  }
});
