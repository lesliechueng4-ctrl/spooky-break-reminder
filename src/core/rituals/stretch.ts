/**
 * Stretch_Ritual (Requirements 7.5, 7.7, 7.8, 10.1-10.6; design, "Core: Rituals").
 *
 * Four stretch steps in a fixed order. Each step counts down 20 s of visible time, then
 * enables its completion control. Activating the enabled control advances to the next step,
 * or completes the Ritual after the fourth step. An enabled control that stays unactivated
 * for 60 s of visible time ends the Ritual without completion.
 *
 * Countdowns use visible time only (7.7). A document hidden for 60 s ends the Ritual (7.8).
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

/** The stretch steps in the order they are presented (10.1). */
export const STRETCH_STEPS = ['neckTilt', 'shoulderRoll', 'wristFinger', 'standingReach'] as const;

/** Identifier of one stretch step. The UI maps each identifier to its illustration and text. */
export type StretchStepId = (typeof STRETCH_STEPS)[number];

/** Length of each step countdown in visible milliseconds (10.2). */
export const STRETCH_STEP_MS = 20_000;

/**
 * Visible milliseconds that an enabled completion control may stay unactivated before the
 * Ritual ends without completion (10.6).
 */
export const STRETCH_CONTROL_LIMIT_MS = 60_000;

/**
 * Inputs to the Stretch_Ritual. `at` is the monotonic time in integer milliseconds.
 * `done` activates the completion control of the current step. `abandon` activates the
 * Abandon control (7.5).
 */
export type StretchInput =
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'done'; readonly at: number }
  | { readonly type: 'abandon'; readonly at: number }
  | { readonly type: 'hidden'; readonly at: number }
  | { readonly type: 'visible'; readonly at: number };

export interface StretchState {
  readonly status: RitualStatus;
  readonly clock: RitualClock;
  /** Index into `STRETCH_STEPS`, from 0 to 3. */
  readonly stepIndex: number;
  /** Visible time in the current step, from 0 to STRETCH_STEP_MS. */
  readonly stepElapsedMs: number;
  /**
   * Visible time since the completion control of the current step became enabled. It is
   * 0 while the step countdown runs.
   */
  readonly enabledMs: number;
  /** Monotonic time at which the Ritual completed or ended, or null while it is running or paused. */
  readonly endedAt: number | null;
}

/** Starts a Stretch_Ritual at `at` on the first step. The document is visible at the start. */
export function startStretch(at: number): StretchState {
  return {
    status: 'running',
    clock: startClock(at),
    stepIndex: 0,
    stepElapsedMs: 0,
    enabledMs: 0,
    endedAt: null,
  };
}

/** Result of crediting one visible span to the step countdown and the control timer. */
interface Credit {
  readonly stepElapsedMs: number;
  readonly enabledMs: number;
  /** Monotonic time at which the control timer expired inside the span, or null. */
  readonly endedAt: number | null;
}

/**
 * Credits a visible span that starts at `from` and lasts `visibleMs`. The span can cross the
 * moment the control is enabled and the moment the control times out, so the walk stops at
 * each boundary in order.
 */
function credit(state: StretchState, from: number, visibleMs: number): Credit {
  let remaining = visibleMs;
  let at = from;
  let stepElapsedMs = state.stepElapsedMs;
  let enabledMs = state.enabledMs;

  if (stepElapsedMs < STRETCH_STEP_MS) {
    const toEnable = STRETCH_STEP_MS - stepElapsedMs;
    if (remaining < toEnable) {
      return { stepElapsedMs: stepElapsedMs + remaining, enabledMs: 0, endedAt: null };
    }
    remaining -= toEnable;
    at += toEnable;
    stepElapsedMs = STRETCH_STEP_MS;
    enabledMs = 0;
  }

  const toTimeout = STRETCH_CONTROL_LIMIT_MS - enabledMs;
  if (remaining >= toTimeout) {
    return { stepElapsedMs, enabledMs: STRETCH_CONTROL_LIMIT_MS, endedAt: at + toTimeout };
  }
  return { stepElapsedMs, enabledMs: enabledMs + remaining, endedAt: null };
}

/**
 * Advances the Stretch_Ritual by one input. Completed and ended Rituals do not change.
 * Inputs `done` and `abandon` have no effect while the document is hidden.
 */
export function stretchStep(state: StretchState, input: StretchInput): StretchState {
  if (state.status === 'completed' || state.status === 'ended') return state;

  const acc = accrue(state.clock, input.at);

  if (acc.timedOutAt !== null) {
    return { ...state, status: 'ended', clock: acc.clock, endedAt: acc.timedOutAt };
  }

  const c = credit(state, acc.visibleFrom, acc.visibleMs);
  if (c.endedAt !== null) {
    return {
      ...state,
      status: 'ended',
      clock: acc.clock,
      stepElapsedMs: c.stepElapsedMs,
      enabledMs: c.enabledMs,
      endedAt: c.endedAt,
    };
  }

  const isHidden = acc.clock.hiddenAt !== null;
  let next: StretchState = {
    ...state,
    clock: acc.clock,
    stepElapsedMs: c.stepElapsedMs,
    enabledMs: c.enabledMs,
  };

  switch (input.type) {
    case 'tick':
      break;
    case 'hidden':
      next = { ...next, clock: hideClock(acc.clock) };
      break;
    case 'visible':
      next = { ...next, clock: showClock(acc.clock, input.at) };
      break;
    case 'abandon':
      if (isHidden) break;
      return { ...next, status: 'ended', endedAt: input.at };
    case 'done': {
      if (isHidden) break;
      // The completion control is disabled until the step countdown reaches its end.
      if (next.stepElapsedMs < STRETCH_STEP_MS) break;
      const lastStep = next.stepIndex === STRETCH_STEPS.length - 1;
      if (lastStep) {
        return { ...next, status: 'completed', endedAt: input.at };
      }
      next = { ...next, stepIndex: next.stepIndex + 1, stepElapsedMs: 0, enabledMs: 0 };
      break;
    }
  }

  return {
    ...next,
    status: next.clock.hiddenAt === null ? 'running' : 'paused',
    endedAt: null,
  };
}

/**
 * Outcome for the shared Ritual interface. Progress is `(stepIndex + stepElapsed / 20 s) / 4`
 * (design, progress for 4.11). A completed Ritual reports 1 and an ended Ritual reports 0 (7.5).
 */
export function stretchOutcome(state: StretchState): RitualOutcome {
  if (state.status === 'completed') return { status: 'completed', progress: 1 };
  if (state.status === 'ended') return { status: 'ended', progress: 0 };
  const stepFraction = state.stepElapsedMs / STRETCH_STEP_MS;
  return {
    status: state.status,
    progress: (state.stepIndex + stepFraction) / STRETCH_STEPS.length,
  };
}
