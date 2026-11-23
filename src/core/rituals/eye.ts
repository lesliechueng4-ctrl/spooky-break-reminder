/**
 * Eye_Ritual (Requirements 7.5, 7.7, 7.8, 8.1-8.6; design, "Core: Rituals").
 *
 * A 20-second countdown that the user completes by looking away from the screen. A press
 * or key on the Ritual surface restarts the countdown. Escape or the Abandon control ends
 * the Ritual without completion. The countdown completes the Ritual when it reaches zero.
 */

import {
  accrue,
  hideClock,
  showClock,
  startClock,
  type RitualClock,
  type RitualOutcome,
  type RitualStatus,
} from './common';

/** Length of the Eye_Ritual countdown in visible milliseconds (8.2). */
export const EYE_DURATION_MS = 20_000;

/**
 * Inputs to the Eye_Ritual. `at` is the monotonic time in integer milliseconds.
 * An `input` with no `key` is a pointer press. `onAbandon` says whether the press or the
 * key targets the focused Abandon control.
 */
export type EyeInput =
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'hidden'; readonly at: number }
  | { readonly type: 'visible'; readonly at: number }
  | {
      readonly type: 'input';
      readonly at: number;
      readonly onAbandon: boolean;
      readonly key?: string;
    };

export interface EyeState {
  readonly status: RitualStatus;
  readonly clock: RitualClock;
  /** Visible countdown time elapsed since the last start or restart, from 0 to EYE_DURATION_MS. */
  readonly elapsedMs: number;
  /** Monotonic time at which the Ritual completed or ended, or null while it is running or paused. */
  readonly endedAt: number | null;
}

/** Keys that activate a focused button. On Abandon they end the Ritual (7.5). */
const ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

/** Keys that move focus. On Abandon they neither restart nor end the countdown (8.4). */
const FOCUS_KEYS: ReadonlySet<string> = new Set(['Tab', 'Shift']);

type InputAction = 'abandon' | 'restart' | 'none';

/** Decides what an input does. Escape ends the Ritual from anywhere on the surface. */
function classify(input: { readonly onAbandon: boolean; readonly key?: string }): InputAction {
  if (input.key === 'Escape') return 'abandon';
  if (input.onAbandon) {
    if (input.key === undefined || ACTIVATION_KEYS.has(input.key)) return 'abandon';
    if (FOCUS_KEYS.has(input.key)) return 'none';
  }
  return 'restart';
}

/** Starts an Eye_Ritual at `at`. The document is visible when the user starts it. */
export function startEye(at: number): EyeState {
  return { status: 'running', clock: startClock(at), elapsedMs: 0, endedAt: null };
}

/** Advances the Eye_Ritual by one input. Completed and ended Rituals do not change. */
export function eyeStep(state: EyeState, input: EyeInput): EyeState {
  if (state.status === 'completed' || state.status === 'ended') return state;

  const acc = accrue(state.clock, input.at);

  if (acc.timedOutAt !== null) {
    return { status: 'ended', clock: acc.clock, elapsedMs: state.elapsedMs, endedAt: acc.timedOutAt };
  }

  // The countdown can reach zero inside the span that this input closes. The Ritual then
  // completes at the moment of zero, not at the time of this input.
  const remainingMs = EYE_DURATION_MS - state.elapsedMs;
  if (state.status === 'running' && acc.visibleMs >= remainingMs) {
    return {
      status: 'completed',
      clock: acc.clock,
      elapsedMs: EYE_DURATION_MS,
      endedAt: acc.visibleFrom + remainingMs,
    };
  }

  let clock = acc.clock;
  let elapsedMs = state.elapsedMs + acc.visibleMs;

  switch (input.type) {
    case 'tick':
      break;
    case 'hidden':
      clock = hideClock(clock);
      break;
    case 'visible':
      clock = showClock(clock, input.at);
      break;
    case 'input': {
      // A hidden document receives no input. Ignore it defensively.
      if (clock.hiddenAt !== null) break;
      const action = classify(input);
      if (action === 'abandon') {
        return { status: 'ended', clock, elapsedMs, endedAt: input.at };
      }
      if (action === 'restart') elapsedMs = 0;
      break;
    }
  }

  return {
    status: clock.hiddenAt === null ? 'running' : 'paused',
    clock,
    elapsedMs,
    endedAt: null,
  };
}

/** Outcome for the shared Ritual interface. An ended Ritual reports zero progress (7.5). */
export function eyeOutcome(state: EyeState): RitualOutcome {
  if (state.status === 'completed') return { status: 'completed', progress: 1 };
  if (state.status === 'ended') return { status: 'ended', progress: 0 };
  return { status: state.status, progress: state.elapsedMs / EYE_DURATION_MS };
}
