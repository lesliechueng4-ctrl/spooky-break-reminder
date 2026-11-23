// Flash_Guard (Requirements 19.4, 6.8). Pure core: no clock, no randomness, no DOM.
//
// The guard watches a luminance proxy L. The caller computes L from the effect channels, for
// example `L = (1 - veil) x (1 - 0.5 x fogCoverage) + jumpScareLum` (design, Flash_Guard).
// A reversal is a change of L whose direction is opposite to the direction of the previous
// change. Each reversal is one Flash, because a Flash is a pair of opposing luminance changes
// (Requirement 19.4 and the Flash term in the glossary).
//
// guardTarget defers any reversal that comes within MIN_REVERSAL_INTERVAL_MS of the previous
// reversal. Committed reversals are therefore at least 500 ms apart. A half-open window of
// 1 000 ms can then hold at most 2 reversals, which keeps the trace below the limit of 3 Flashes
// per second.

/** Minimum time between two committed reversals of the luminance proxy. */
export const MIN_REVERSAL_INTERVAL_MS = 500;

/** Length of the window in which Flashes are limited (Requirement 19.4). */
export const FLASH_WINDOW_MS = 1_000;

/** Maximum Flashes allowed in any FLASH_WINDOW_MS window (Requirement 19.4). */
export const MAX_FLASHES_PER_WINDOW = 3;

/** Jump_Scare timeline: rise, hold and fade durations (Requirement 6.8). */
export const JUMP_SCARE_RISE_MS = 60;
export const JUMP_SCARE_HOLD_MS = 1_200;
export const JUMP_SCARE_FADE_MS = 300;
/** Total Jump_Scare duration; at most 2 000 ms (Requirement 6.8). */
export const JUMP_SCARE_TOTAL_MS = JUMP_SCARE_RISE_MS + JUMP_SCARE_HOLD_MS + JUMP_SCARE_FADE_MS;

/**
 * Guard state for one luminance channel.
 * - `lum`: the luminance value that is shown now (the last committed value).
 * - `dir`: the direction of the last committed change, or 0 before the first change.
 * - `reversedAtMs`: the time of the last committed reversal, or null if none has happened.
 */
export interface GuardState {
  readonly lum: number;
  readonly dir: -1 | 0 | 1;
  readonly reversedAtMs: number | null;
}

/** The starting state: `lum` is shown, no direction is set and no reversal has happened. */
export function initialGuardState(lum: number): GuardState {
  assertFinite(lum, 'lum');
  return { lum, dir: 0, reversedAtMs: null };
}

/**
 * Applies a new target value at schedule time `atMs` and returns the next state.
 *
 * - A change in the same direction as the last committed change, or the first change, commits
 *   at once and is not a reversal.
 * - A reversal commits at once when no earlier reversal exists or when at least
 *   MIN_REVERSAL_INTERVAL_MS has passed since the last one.
 * - A reversal that comes sooner is deferred. The returned state keeps the previous `lum`, so
 *   the displayed value holds. Calling again with the same target after the interval commits it.
 *
 * Call this on every frame or event with the latest target. The function is pure, so a deferred
 * target is re-evaluated from the state the caller stores.
 */
export function guardTarget(prev: GuardState, target: number, atMs: number): GuardState {
  assertFinite(target, 'target');
  assertFinite(atMs, 'atMs');
  const delta = target - prev.lum;
  if (delta === 0) {
    return prev;
  }
  const dir: -1 | 1 = delta > 0 ? 1 : -1;
  if (prev.dir === 0 || dir === prev.dir) {
    return { lum: target, dir, reversedAtMs: prev.reversedAtMs };
  }
  if (prev.reversedAtMs !== null && atMs - prev.reversedAtMs < MIN_REVERSAL_INTERVAL_MS) {
    return prev;
  }
  return { lum: target, dir, reversedAtMs: atMs };
}

/**
 * Counts the Flashes in a luminance trace. The trace holds the values shown at each time, in
 * time order. A Flash is a reversal of the direction of change, as defined for guardTarget.
 *
 * Returns the largest number of Flashes that fall in any half-open window `[s, s + windowMs)`,
 * so the result is the worst case over every sliding window of that length.
 */
export function countFlashes(
  trace: ReadonlyArray<{ readonly t: number; readonly lum: number }>,
  windowMs: number,
): number {
  assertFinite(windowMs, 'windowMs');
  const reversals: number[] = [];
  let dir: -1 | 0 | 1 = 0;
  for (let i = 1; i < trace.length; i++) {
    const delta = trace[i].lum - trace[i - 1].lum;
    if (delta === 0) {
      continue;
    }
    const step: -1 | 1 = delta > 0 ? 1 : -1;
    if (dir !== 0 && step !== dir) {
      reversals.push(trace[i].t);
    }
    dir = step;
  }
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < reversals.length; hi++) {
    while (reversals[hi] - reversals[lo] >= windowMs) {
      lo++;
    }
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`flashGuard: ${name} must be a finite number, got ${String(value)}`);
  }
}
