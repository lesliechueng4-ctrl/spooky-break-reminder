/**
 * Shared pieces of the Ritual state machines (design, "Core: Rituals").
 *
 * Every Ritual is a pure step function `step(state, input) -> state`. Each input carries
 * a monotonic timestamp in integer milliseconds that the shell reads from
 * `performance.now()`. This module never reads a clock and never touches the DOM.
 *
 * Countdowns advance only while the presenting document is visible (7.7). A document
 * that stays hidden for 60 s ends its Ritual without completion, stamped at
 * `hiddenAt + 60 s` (7.8), no matter when the document becomes visible again.
 */

/** Hidden time after which a paused Ritual ends without completion (7.8). */
export const RITUAL_HIDDEN_LIMIT_MS = 60_000;

/** Lifecycle of a Ritual as reported to the Scheduler and the UI. */
export type RitualStatus = 'running' | 'paused' | 'completed' | 'ended';

/**
 * Keys of the Ritual hints that the UI translates: the exhale reminder (9.7) and the
 * pacing hints for a hold that is too short or too long (9.6).
 */
export type HintKey = 'exhaleReminder' | 'holdTooShort' | 'holdTooLong';

/** Result that every Ritual reports after a step. */
export interface RitualOutcome {
  readonly status: RitualStatus;
  /**
   * Progress in the range 0 to 1 for the effect scaling in Requirement 4.11. It is 1 after
   * a completion and 0 after an end, because an ended Ritual discards its progress (7.5).
   */
  readonly progress: number;
  readonly hint?: HintKey;
}

/** Visibility bookkeeping that every Ritual shares. */
export interface RitualClock {
  /**
   * Monotonic time up to which visible time has been credited. While the document is
   * hidden, this stays at `hiddenAt`, so hidden time can never be credited later.
   */
  readonly at: number;
  /** Monotonic time at which the document became hidden, or null while it is visible. */
  readonly hiddenAt: number | null;
}

/** Result of moving a clock forward to a new input time. */
export interface Accrual {
  readonly clock: RitualClock;
  /** Start of the visible span that was credited. */
  readonly visibleFrom: number;
  /**
   * Visible milliseconds between the previous clock time and the input time. It is zero
   * while the document is hidden and for a backward step (a timestamp earlier than the
   * clock adds no time).
   */
  readonly visibleMs: number;
  /** Monotonic time at which a hidden Ritual timed out, or null if it did not. */
  readonly timedOutAt: number | null;
}

/** Starts a clock at `at` with the document visible. */
export function startClock(at: number): RitualClock {
  return { at, hiddenAt: null };
}

/**
 * Credits the visible time between the clock and `at`. A hidden clock credits nothing.
 * A hidden clock that reaches the 60 s limit reports `timedOutAt = hiddenAt + 60 s`.
 */
export function accrue(clock: RitualClock, at: number): Accrual {
  if (clock.hiddenAt !== null) {
    const timedOut = at - clock.hiddenAt >= RITUAL_HIDDEN_LIMIT_MS;
    return {
      clock,
      visibleFrom: clock.at,
      visibleMs: 0,
      timedOutAt: timedOut ? clock.hiddenAt + RITUAL_HIDDEN_LIMIT_MS : null,
    };
  }
  const visibleMs = Math.max(0, at - clock.at);
  return {
    clock: { at: clock.at + visibleMs, hiddenAt: null },
    visibleFrom: clock.at,
    visibleMs,
    timedOutAt: null,
  };
}

/**
 * Marks the document hidden at the clock time. Call it right after `accrue`, so the hidden
 * span starts at the time of the hidden event. A clock that is already hidden is unchanged,
 * so a repeated hidden event does not restart the 60 s limit.
 */
export function hideClock(clock: RitualClock): RitualClock {
  if (clock.hiddenAt !== null) return clock;
  return { at: clock.at, hiddenAt: clock.at };
}

/** Marks the document visible again at `at`. The hidden span is not credited. */
export function showClock(clock: RitualClock, at: number): RitualClock {
  return { at: Math.max(clock.at, at), hiddenAt: null };
}
