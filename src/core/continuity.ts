// Schedule continuity (Requirements 13.10, 14.2-14.8, design "Schedule Continuity").
// Pure core: no clock, no randomness, no DOM, no timers. All values are integer milliseconds.
//
// classifyGap decides how a gap in running time is accounted for. The browser cannot report
// what happened during a gap, so the function weighs the evidence the platform adapters pass in.
// Rules are applied in order; the first matching rule decides the verdict.

import {
  GAP_TOLERANCE_MS,
  SUSPEND_EVIDENCE_MS,
  UNOBSERVED_GAP_LIMIT_MS,
} from './time';

/** Evidence and timing for one gap between two evaluations of the schedule. */
export interface GapInput {
  /** now - lastAliveWall; may be negative. */
  readonly gapWallMs: number;
  /** Same page session only; null after a reload. */
  readonly gapMonoMs: number | null;
  /** Natural_Break_Duration in wall-clock milliseconds. */
  readonly naturalBreakWallMs: number;
  /** Chromium signals only. */
  readonly intervention: 'none' | 'frozen' | 'discarded';
  /** The Idle_Monitor reported an idle user or a locked screen before the gap. */
  readonly awayOpen: boolean;
}

export type GapVerdict =
  | { readonly kind: 'backward' } // add 0 (14.7)
  | { readonly kind: 'continuous'; readonly elapsedWallMs: number } // page was alive
  | { readonly kind: 'elapsed'; readonly elapsedWallMs: number; readonly reason: 'short' | 'frozen' | 'discarded' }
  | { readonly kind: 'away'; readonly awayWallMs: number; readonly reason: 'suspend' | 'no-signal' | 'over-limit' }
  | { readonly kind: 'awayContinues'; readonly elapsedWallMs: number }; // Idle_Monitor closes it later

/**
 * Classifies one gap. The rules, in order (design, "Classification Rules"):
 *
 * 1. A negative gap is a backward clock step and adds zero (14.7).
 * 2. A gap of at most GAP_TOLERANCE_MS means the page was running: continuous time.
 * 3. A gap that began with an open absence is awayContinues. The Idle_Monitor closes that
 *    Away_Period with its real start time (13.3, 14.5).
 * 4. Suspend evidence (same page session, wall time ahead of monotonic time by at least
 *    SUSPEND_EVIDENCE_MS): away at or above Natural_Break_Duration, otherwise elapsed (14.5).
 * 5. An Intervention_Signal (freeze or discard) with a gap of at most UNOBSERVED_GAP_LIMIT_MS:
 *    elapsed (14.4, 14.6).
 * 6. A gap of at least Natural_Break_Duration: away. The reason is `over-limit` when rule 5
 *    failed only because the gap exceeded the limit, and `no-signal` otherwise (14.3, 14.8).
 * 7. Any other gap is elapsed (14.2).
 *
 * Integer milliseconds are required for every duration; non-integer input throws a RangeError.
 */
export function classifyGap(i: GapInput): GapVerdict {
  requireWholeMs(i.gapWallMs, 'gapWallMs');
  requireWholeMs(i.naturalBreakWallMs, 'naturalBreakWallMs');
  if (i.gapMonoMs !== null) {
    requireWholeMs(i.gapMonoMs, 'gapMonoMs');
  }

  // Rule 1: backward step.
  if (i.gapWallMs < 0) {
    return { kind: 'backward' };
  }

  // Rule 2: the page kept running through the gap.
  if (i.gapWallMs <= GAP_TOLERANCE_MS) {
    return { kind: 'continuous', elapsedWallMs: i.gapWallMs };
  }

  // Rule 3: the user was already away when the gap began.
  if (i.awayOpen) {
    return { kind: 'awayContinues', elapsedWallMs: i.gapWallMs };
  }

  // Rule 4: the device slept (or the clock jumped) in the same page session.
  if (i.gapMonoMs !== null && i.gapWallMs - i.gapMonoMs >= SUSPEND_EVIDENCE_MS) {
    if (i.gapWallMs >= i.naturalBreakWallMs) {
      return { kind: 'away', awayWallMs: i.gapWallMs, reason: 'suspend' };
    }
    return { kind: 'elapsed', elapsedWallMs: i.gapWallMs, reason: 'short' };
  }

  // Rule 5: the browser froze or discarded the page, and the gap is within the limit.
  if (i.intervention !== 'none' && i.gapWallMs <= UNOBSERVED_GAP_LIMIT_MS) {
    return { kind: 'elapsed', elapsedWallMs: i.gapWallMs, reason: i.intervention };
  }

  // Rule 6: a long gap with no evidence that the user kept working.
  if (i.gapWallMs >= i.naturalBreakWallMs) {
    // Reaching this rule with an intervention means rule 5 failed on the limit.
    const reason = i.intervention !== 'none' ? 'over-limit' : 'no-signal';
    return { kind: 'away', awayWallMs: i.gapWallMs, reason };
  }

  // Rule 7: a short gap counts as elapsed time.
  return { kind: 'elapsed', elapsedWallMs: i.gapWallMs, reason: 'short' };
}

function requireWholeMs(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`classifyGap: ${name} must be an integer number of milliseconds, got ${value}`);
  }
}
