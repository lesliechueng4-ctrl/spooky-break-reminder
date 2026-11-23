/**
 * Clock adapter (design: "Platform adapters", clock.ts).
 *
 * The core never reads a clock. The engine receives the wall clock and the monotonic clock
 * through this interface, so tests can inject a fake clock. Readings are rounded to whole
 * milliseconds here, at the boundary where values enter the core (tech steering: integer ms).
 */
import { toWholeMs } from '../core/time';

export interface Clock {
  /** Wall-clock time in whole epoch milliseconds. Can step backward (Requirement 14.7). */
  wall(): number;
  /** Monotonic time in whole milliseconds since the page started. Never steps backward. */
  mono(): number;
}

/**
 * The browser clock. `performance.now()` is available in every browser the App supports, so
 * no fallback is provided for it; a missing `performance` would stop the App at startup.
 */
export const systemClock: Clock = {
  wall: () => toWholeMs(Date.now()),
  mono: () => toWholeMs(performance.now()),
};
