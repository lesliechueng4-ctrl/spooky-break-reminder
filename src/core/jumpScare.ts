// Jump_Scare policy (design: "Core: Policies"; Requirements 5.2, 6.5, 6.6, 6.7, 6.10, 6.11).
// Pure core: no clock, no randomness, no DOM, no timers. The engine calls these at every commit and
// feeds `nextHold` with the events named in 6.6 and 6.10 (design: Jump_Scare hold).

import type { ScheduleView } from './scheduler';

/** Inputs that the policy reads besides the schedule view. Engine memory, not persisted. */
export interface JumpScareContext {
  /** Nightmare_Mode is enabled (Requirements 5.2, 6.10). */
  readonly nightmare: boolean;
  /** The hold set by `nextHold` for a Nightmare_Mode toggle during a level-5 Haunting (Requirement 6.11). */
  readonly held: boolean;
  /** The App document is visible (Requirement 6.5). */
  readonly appVisible: boolean;
  /** The Ghost_Window is visible (Requirement 6.5). */
  readonly ghostVisible: boolean;
  /** This tab is the Active_Instance that runs the Scheduler. */
  readonly activeInstance: boolean;
}

/**
 * Events that can change the hold (Requirements 6.6, 6.10, 6.11):
 * - `nightmareEnabled`: Nightmare_Mode turned on (from this tab or another tab).
 * - `surfaceShown`: the App document or the Ghost_Window became visible.
 * - `snoozeEnded`: a Snooze ran out.
 * - `ritualEnded`: a Ritual ended without completion.
 * - `hauntingEnded`: the Haunting ended by an Exorcism.
 */
export type HoldInput =
  | 'nightmareEnabled'
  | 'surfaceShown'
  | 'snoozeEnded'
  | 'ritualEnded'
  | 'hauntingEnded';

/**
 * True when the Jump_Scare should be presented now. Every condition must hold: Nightmare_Mode is
 * on and not held (6.11), the Haunting is at level 5 and its Jump_Scare was not shown (6.7), no
 * Snooze and no Ritual is active (6.6), this tab is the Active_Instance, and the App document or the
 * Ghost_Window is visible (6.5). Disabling Nightmare_Mode therefore cancels a pending Jump_Scare (6.10).
 */
export function shouldPresentJumpScare(v: ScheduleView, c: JumpScareContext): boolean {
  if (v.phase !== 'haunting') return false;
  return (
    c.nightmare &&
    !c.held &&
    v.level === 5 &&
    !v.jumpScareShown &&
    v.snoozeRemainingMs === 0 &&
    v.ritual === null &&
    c.activeInstance &&
    (c.appVisible || c.ghostVisible)
  );
}

/**
 * Next value of the hold. Turning on Nightmare_Mode during a level-5 Haunting whose Jump_Scare was
 * not shown sets the hold, so the Jump_Scare does not fire on the spot (6.11). The listed moments
 * named in 6.6 and the end of the Haunting clear it, and the predicate above then decides. Turning
 * Nightmare_Mode on in any other state keeps the current hold value.
 */
export function nextHold(held: boolean, input: HoldInput, v: ScheduleView): boolean {
  switch (input) {
    case 'nightmareEnabled':
      return held || (v.phase === 'haunting' && v.level === 5 && !v.jumpScareShown);
    case 'surfaceShown':
    case 'snoozeEnded':
    case 'ritualEnded':
    case 'hauntingEnded':
      return false;
  }
}
