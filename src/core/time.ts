/**
 * Time base of the pure core (design: "Core: Time", tech steering: integer milliseconds).
 *
 * Every duration and timestamp in the core is an integer number of milliseconds.
 * The core never reads a clock. Platform adapters read the wall clock and the
 * monotonic clock, round the values to whole milliseconds (see `toWholeMs`) and
 * pass them in as arguments.
 */

/**
 * Schedule milliseconds per wall-clock millisecond: 1 in normal use and 60 in Demo_Mode (Requirement 25.3).
 * Schedule time drives the Work_Interval candle and the escalation. The Scheduler converts the wall-clock
 * Snooze and Pause lengths with this speed, so they last their stated wall-clock time (Requirement 25.4).
 */
export const SPEED = { normal: 1, demo: 60 } as const;
export type Speed = (typeof SPEED)[keyof typeof SPEED];

/** The speed of a mode: Demo_Mode runs schedule time 60 times faster (Requirement 25.1). */
export function speedFor(demo: boolean): Speed {
  return demo ? SPEED.demo : SPEED.normal;
}

export const MINUTE_MS = 60_000;

/** The longest gap that counts as continuous running time. Below the 1-minute minimum Natural_Break_Duration. */
export const GAP_TOLERANCE_MS = 45_000;
/** The longest Unobserved_Gap that an Intervention_Signal can count as elapsed time (60 minutes). */
export const UNOBSERVED_GAP_LIMIT_MS = 3_600_000;
/** Wall-clock lead over the monotonic clock that counts as Suspend_Evidence. */
export const SUSPEND_EVIDENCE_MS = 30_000;
/** Persistence heartbeat interval (Requirement 14.1). */
export const HEARTBEAT_MS = 30_000;

/** Natural_Break_Duration in Demo_Mode, in wall-clock milliseconds (Requirement 25.5). */
export const DEMO_NATURAL_BREAK_MS = MINUTE_MS;

/** Converts a wall-clock or monotonic reading to whole milliseconds. Adapters call this before values enter the core. */
export function toWholeMs(value: number): number {
  return Math.round(value);
}

/**
 * Schedule time added by one wall-clock step: the forward step times the speed.
 * A backward step adds zero (Requirements 1.6 and 14.7).
 */
export function scheduleDelta(prevWall: number, nowWall: number, speed: Speed): number {
  requireWholeMs(prevWall, 'prevWall');
  requireWholeMs(nowWall, 'nowWall');
  return Math.max(0, nowWall - prevWall) * speed;
}

/**
 * Natural_Break_Duration in wall-clock milliseconds. Demo_Mode always uses one minute
 * (Requirement 25.5); normal use reads the setting in minutes.
 */
export function naturalBreakWallMs(settings: { readonly naturalBreakMin: number }, demo: boolean): number {
  if (demo) return DEMO_NATURAL_BREAK_MS;
  requireWholeMs(settings.naturalBreakMin * MINUTE_MS, 'naturalBreakMin');
  return settings.naturalBreakMin * MINUTE_MS;
}

function requireWholeMs(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be an integer number of milliseconds, got ${value}`);
  }
}
