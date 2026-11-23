/**
 * Breathing_Ritual (Requirements 7.5, 7.7, 7.8, 9.1, 9.5-9.9; design, "Core: Rituals").
 *
 * The user holds a key or a pointer press on the breathing target. A hold that lasts 3 to 6
 * seconds counts as one breath cycle. The guide shows 4 s inhale and 6 s exhale phases that
 * repeat until the Ritual ends. Six counted holds complete the Ritual. The Ritual ends
 * without completion after 60 s with no press or release, which also covers a stuck key.
 */

import {
  accrue,
  hideClock,
  showClock,
  startClock,
  type HintKey,
  type RitualClock,
  type RitualOutcome,
  type RitualStatus,
} from './common';

/** Number of counted holds that complete the Breathing_Ritual (9.8). */
export const BREATH_CYCLES = 6;

/** Guide inhale phase length in visible milliseconds (9.1). */
export const INHALE_MS = 4_000;

/** Guide exhale phase length in visible milliseconds (9.1). */
export const EXHALE_MS = 6_000;

/** One guide cycle: an inhale followed by an exhale. */
export const GUIDE_CYCLE_MS = INHALE_MS + EXHALE_MS;

/** Shortest hold that counts, inclusive (9.5). Shorter holds get a pacing hint (9.6). */
export const HOLD_MIN_MS = 3_000;

/** Longest hold that counts, inclusive (9.5). Longer holds get a pacing hint (9.6). */
export const HOLD_MAX_MS = 6_000;

/**
 * A press that starts less than this long after the previous release is an exhale
 * reminder, and that hold is excluded from the count (9.7).
 */
export const EXHALE_GAP_MS = 4_000;

/** Visible time with no press or release after which the Ritual ends (9.9). */
export const BREATHING_IDLE_LIMIT_MS = 60_000;

/**
 * Inputs to the Breathing_Ritual. `at` is the monotonic time in integer milliseconds.
 * A `press` with `repeat: true` is an auto-repeated key event. It is ignored entirely, so
 * it neither changes the hold nor resets the idle limit.
 */
export type BreathingInput =
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'hidden'; readonly at: number }
  | { readonly type: 'visible'; readonly at: number }
  | { readonly type: 'press'; readonly at: number; readonly repeat?: boolean }
  | { readonly type: 'release'; readonly at: number };

export interface BreathingState {
  readonly status: RitualStatus;
  readonly clock: RitualClock;
  /** Visible time since the start, used to place the guide in its 10 s cycle. */
  readonly guideMs: number;
  /** Visible time since the last press or release, or since the start. */
  readonly idleMs: number;
  /** Monotonic time of the press that is currently held, or null when no hold is active. */
  readonly holdStartedAt: number | null;
  /** True when the held press is an exhale reminder that cannot be counted (9.7). */
  readonly holdExcluded: boolean;
  /** Monotonic time of the most recent matched release, or null if there has been none. */
  readonly lastReleaseAt: number | null;
  /** Counted holds so far, from 0 to BREATH_CYCLES. */
  readonly validHolds: number;
  /** Pacing or exhale hint from the latest hold, or null. Cleared by the next counted press. */
  readonly hint: HintKey | null;
  /** Monotonic time at which the Ritual completed or ended, or null while it is running. */
  readonly endedAt: number | null;
}

export interface BreathingGuide {
  readonly phase: 'inhale' | 'exhale';
  /** Time elapsed in the current phase, from 0 up to the phase length. */
  readonly phaseElapsedMs: number;
}

/** Starts a Breathing_Ritual at `at`. The document is visible when the user starts it. */
export function startBreathing(at: number): BreathingState {
  return {
    status: 'running',
    clock: startClock(at),
    guideMs: 0,
    idleMs: 0,
    holdStartedAt: null,
    holdExcluded: false,
    lastReleaseAt: null,
    validHolds: 0,
    hint: null,
    endedAt: null,
  };
}

function endBreathing(state: BreathingState, clock: RitualClock, endedAt: number): BreathingState {
  return {
    ...state,
    status: 'ended',
    clock,
    holdStartedAt: null,
    holdExcluded: false,
    endedAt,
  };
}

/** Advances the Breathing_Ritual by one input. Completed and ended Rituals do not change. */
export function breathingStep(state: BreathingState, input: BreathingInput): BreathingState {
  if (state.status === 'completed' || state.status === 'ended') return state;

  const acc = accrue(state.clock, input.at);

  if (acc.timedOutAt !== null) return endBreathing(state, acc.clock, acc.timedOutAt);

  // The idle limit can run out inside the span that this input closes. The Ritual then ends
  // at the moment the limit is reached, not at the time of this input.
  const idleLeftMs = BREATHING_IDLE_LIMIT_MS - state.idleMs;
  if (acc.visibleMs >= idleLeftMs) {
    return endBreathing(state, acc.clock, acc.visibleFrom + idleLeftMs);
  }

  let clock = acc.clock;
  let idleMs = state.idleMs + acc.visibleMs;
  let holdStartedAt = state.holdStartedAt;
  let holdExcluded = state.holdExcluded;
  let lastReleaseAt = state.lastReleaseAt;
  let validHolds = state.validHolds;
  let hint = state.hint;

  switch (input.type) {
    case 'tick':
      break;
    case 'hidden':
      // A hold that spans a hidden span is discarded, because its release may never reach
      // this document. Hidden time is never credited to a hold (7.7).
      clock = hideClock(clock);
      holdStartedAt = null;
      holdExcluded = false;
      break;
    case 'visible':
      clock = showClock(clock, input.at);
      break;
    case 'press': {
      // A hidden document receives no input. A second press while a hold is active, and any
      // repeated key event, change nothing.
      if (clock.hiddenAt !== null || input.repeat === true || holdStartedAt !== null) break;
      const excluded = lastReleaseAt !== null && input.at - lastReleaseAt < EXHALE_GAP_MS;
      idleMs = 0;
      holdStartedAt = input.at;
      holdExcluded = excluded;
      hint = excluded ? 'exhaleReminder' : null;
      break;
    }
    case 'release': {
      // A release with no active hold has nothing to match, so it is ignored.
      if (holdStartedAt === null) break;
      const heldMs = Math.max(0, input.at - holdStartedAt);
      const wasExcluded = holdExcluded;
      idleMs = 0;
      lastReleaseAt = input.at;
      holdStartedAt = null;
      holdExcluded = false;
      if (wasExcluded) break;
      if (heldMs < HOLD_MIN_MS) {
        hint = 'holdTooShort';
      } else if (heldMs > HOLD_MAX_MS) {
        hint = 'holdTooLong';
      } else {
        validHolds += 1;
        hint = null;
      }
      break;
    }
  }

  const guideMs = state.guideMs + acc.visibleMs;

  if (validHolds >= BREATH_CYCLES) {
    return {
      status: 'completed',
      clock,
      guideMs,
      idleMs,
      holdStartedAt,
      holdExcluded,
      lastReleaseAt,
      validHolds,
      hint,
      endedAt: input.at,
    };
  }

  return {
    status: clock.hiddenAt === null ? 'running' : 'paused',
    clock,
    guideMs,
    idleMs,
    holdStartedAt,
    holdExcluded,
    lastReleaseAt,
    validHolds,
    hint,
    endedAt: null,
  };
}

/** Guide phase for the visual timer and the phase cue tone (9.2, 9.3). */
export function breathingGuide(state: BreathingState): BreathingGuide {
  const inCycle = state.guideMs % GUIDE_CYCLE_MS;
  if (inCycle < INHALE_MS) return { phase: 'inhale', phaseElapsedMs: inCycle };
  return { phase: 'exhale', phaseElapsedMs: inCycle - INHALE_MS };
}

/** Outcome for the shared Ritual interface. An ended Ritual reports zero progress (7.5). */
export function breathingOutcome(state: BreathingState): RitualOutcome {
  if (state.status === 'completed') return { status: 'completed', progress: 1 };
  if (state.status === 'ended') return { status: 'ended', progress: 0 };
  const progress = state.validHolds / BREATH_CYCLES;
  return state.hint === null
    ? { status: state.status, progress }
    : { status: state.status, progress, hint: state.hint };
}
