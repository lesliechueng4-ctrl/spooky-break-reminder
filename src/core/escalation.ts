// Escalation and effect targets (design: "Core: Escalation and Effect Parameters";
// Requirements 4, 5.3, 11.2, 19.3). Pure core: no clock, no randomness, no DOM.
//
// effectsFor turns a ScheduleView into target values for the HauntLayer. Every target is a
// function of the Haunting_Level, the Overdue_Duration, the Snooze count, the Snooze state, the
// Ritual progress and Reduced_Motion. Each channel carries break information (design table
// "Haunting_Level"). Nothing here is decorative.

import { MAX_SNOOZES_PER_HAUNTING, type HauntingLevel, type ScheduleView } from './scheduler';

/** Crack count at each Haunting_Level before the per-Snooze cracks are added (Requirements 4.3, 4.9). */
export const CRACK_BASE_BY_LEVEL: readonly number[] = [0, 0, 0, 3, 5, 7];

/** Whisper gain as a fraction of Master_Volume at each level (Requirement 18.6). */
export const WHISPER_GAIN_BY_LEVEL: readonly number[] = [0, 0, 0, 0.4, 0.7, 1];

/** Ghost opacity at each level. Level 0 is Calm_State (Requirement 4.1). */
const GHOST_OPACITY_BY_LEVEL: readonly number[] = [0, 0.5, 0.6, 0.75, 0.9, 1];

/**
 * Ghost scale at the start of each level. Under Reduced_Motion this is the static size for the
 * whole level (Requirement 19.3). Without Reduced_Motion, level 4 grows from its start value
 * toward the viewer (Requirement 4.5). Every level is strictly larger than the one below it (4.6).
 */
const GHOST_SCALE_AT_LEVEL: readonly number[] = [0, 0.3, 0.45, 0.6, 0.75, 1.1];

/** Extra ghost scale that level 4 adds as its Overdue_Duration runs from 3 to 4 Escalation_Steps. */
const GHOST_APPROACH_SPAN = 0.2;

/** Fog scale at the start of level 2, and the scale from the start of level 5 onward (Requirement 4.2). */
const FOG_SCALE_AT_LEVEL_2 = 1.65;
const FOG_SCALE_AT_LEVEL_5 = 1;

/** Fog scale value that means "no fog" (level 1 and Calm_State). */
export const NO_FOG = Infinity;

/** Samples per axis of the fog coverage grid (design: "fogCoverage(S) samples ... 200 x 200"). */
export const FOG_COVERAGE_GRID = 200;

/** Ritual progress and any other input in [0, 1]. */
export interface EffectContext {
  /** True when the operating system or the Settings_Panel activates Reduced_Motion (Requirement 19.3). */
  readonly reducedMotion: boolean;
  /** Ritual progress in [0, 1] (Requirement 4.11). Pass 0 when no Ritual runs. */
  readonly ritualProgress: number;
  /**
   * Escalation_Step snapshot of the running Haunting, in integer milliseconds. Pass the view's
   * `escalationStepMs`, never the current setting. Calm_State ignores it.
   */
  readonly escalationStepMs: number;
}

/** Target values for the HauntLayer channels. */
export interface EffectTargets {
  /** True in Calm_State, false during a Haunting (Requirement 4.1). */
  readonly candleLit: boolean;
  /** Dark veil opacity: 0 in Calm_State, 0.30 at level 1 and +0.10 per level (Requirements 4.1, 5.3). */
  readonly veil: number;
  /** Fog scale S. The fog layer is scaled by S. `NO_FOG` (Infinity) means no fog (Requirement 4.2). */
  readonly fogScale: number;
  /** Fog layer opacity, 0 without fog. Scales with Ritual progress (Requirement 4.11). */
  readonly fogOpacity: number;
  /** Ghost scale. 0 in Calm_State. Strictly larger at each level (Requirements 4.1, 4.5, 4.6). */
  readonly ghostScale: number;
  /** Ghost opacity. Scales with Ritual progress (Requirement 4.11). */
  readonly ghostOpacity: number;
  /** Cracks: base(level) plus one per Snooze used in this Haunting (Requirements 4.3, 4.9). */
  readonly cracks: number;
  /** Whisper gain as a fraction of Master_Volume: 0.4, 0.7 and 1.0 at levels 3, 4 and 5 (Requirement 18.6). */
  readonly whisperGain: number;
  /** True at Haunting_Level 5, the Possession_Effect (Requirement 4.7). A flag, not scaled by Ritual progress. */
  readonly possession: boolean;
  /** True while a Snooze is active, so the App document and the Ghost_Window hide every effect (Requirement 11.2). */
  readonly hidden: boolean;
}

/**
 * Target values for one view. A Calm view has no effects. A Haunting view has the effects of its
 * level and every lower level (Requirement 4.8).
 *
 * Ritual progress multiplies the intensity channels (veil, fog opacity, ghost opacity and Whisper
 * gain). Cracks and the candle are not scaled (Requirement 4.11). Geometry (fog scale, ghost
 * scale) is not an intensity, so it is not scaled either.
 */
export function effectsFor(view: ScheduleView, ctx: EffectContext): EffectTargets {
  assertContext(ctx);

  if (view.phase === 'calm') {
    return {
      candleLit: true,
      veil: 0,
      fogScale: NO_FOG,
      fogOpacity: 0,
      ghostScale: 0,
      ghostOpacity: 0,
      cracks: 0,
      whisperGain: 0,
      possession: false,
      hidden: false,
    };
  }

  const level = view.level;
  const keep = 1 - ctx.ritualProgress;
  const snoozesUsed = MAX_SNOOZES_PER_HAUNTING - view.snoozesLeft;

  return {
    candleLit: false,
    veil: (0.3 + 0.1 * (level - 1)) * keep,
    fogScale: fogScaleFor(level, view.overdueMs, ctx),
    fogOpacity: level >= 2 ? keep : 0,
    ghostScale: ghostScaleFor(level, view.overdueMs, ctx),
    ghostOpacity: GHOST_OPACITY_BY_LEVEL[level] * keep,
    cracks: CRACK_BASE_BY_LEVEL[level] + snoozesUsed,
    whisperGain: WHISPER_GAIN_BY_LEVEL[level] * keep,
    possession: level === 5,
    hidden: view.snoozeRemainingMs > 0,
  };
}

/**
 * Fog coverage of the viewport for a fog scale S, as a fraction in [0, 1]. The fog alpha at a
 * screen point p is `fogAlpha(p / S)`, so this samples that alpha on a 200 x 200 grid of cell
 * centers and returns the share of samples whose alpha is at least 0.5. `NO_FOG` (Infinity)
 * gives 0. Coordinates are normalized to [-1, 1] on each axis, so the result does not depend on
 * the aspect ratio.
 */
export function fogCoverage(scale: number): number {
  if (Number.isNaN(scale) || scale <= 0) {
    throw new RangeError(`fogCoverage: scale must be positive, got ${String(scale)}`);
  }
  const n = FOG_COVERAGE_GRID;
  let covered = 0;
  for (let i = 0; i < n; i++) {
    const u = -1 + ((i + 0.5) * 2) / n;
    for (let j = 0; j < n; j++) {
      const v = -1 + ((j + 0.5) * 2) / n;
      if (fogAlpha(u / scale, v / scale) >= 0.5) covered++;
    }
  }
  return covered / (n * n);
}

/**
 * The fog alpha at normalized coordinates (u, v): a smoothstep of the radius r = (u^4 + v^4)^(1/4)
 * from 0.45 to 0.75. It is 0 at the centre and 1 at the edges of the vignette.
 */
export function fogAlpha(u: number, v: number): number {
  const r = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
  const t = clamp01((r - 0.45) / (0.75 - 0.45));
  return t * t * (3 - 2 * t);
}

/**
 * Fog scale for a level and Overdue_Duration. It falls linearly from 1.65 at the start of level 2
 * to 1.0 at the start of level 5, and stays at 1.0. Under Reduced_Motion it is one static value
 * per level, the value at the start of that level (Requirement 19.3).
 */
function fogScaleFor(level: HauntingLevel, overdueMs: number, ctx: EffectContext): number {
  if (level < 2) return NO_FOG;
  const drop = FOG_SCALE_AT_LEVEL_2 - FOG_SCALE_AT_LEVEL_5;
  const progress = ctx.reducedMotion
    ? (level - 2) / 3
    : clamp01((overdueMs - ctx.escalationStepMs) / (3 * ctx.escalationStepMs));
  return FOG_SCALE_AT_LEVEL_2 - drop * progress;
}

/**
 * Ghost scale for a level and Overdue_Duration. Level 4 approaches the viewer as the overdue time
 * runs from 3 to 4 Escalation_Steps. Reduced_Motion uses the static value of the level instead.
 */
function ghostScaleFor(level: HauntingLevel, overdueMs: number, ctx: EffectContext): number {
  if (level === 4 && !ctx.reducedMotion) {
    const within = clamp01((overdueMs - 3 * ctx.escalationStepMs) / ctx.escalationStepMs);
    return GHOST_SCALE_AT_LEVEL[4] + GHOST_APPROACH_SPAN * within;
  }
  return GHOST_SCALE_AT_LEVEL[level];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function assertContext(ctx: EffectContext): void {
  if (!Number.isFinite(ctx.ritualProgress) || ctx.ritualProgress < 0 || ctx.ritualProgress > 1) {
    throw new RangeError(`effectsFor: ritualProgress must be in [0, 1], got ${String(ctx.ritualProgress)}`);
  }
  if (!Number.isSafeInteger(ctx.escalationStepMs) || ctx.escalationStepMs <= 0) {
    throw new RangeError(
      `effectsFor: escalationStepMs must be a positive safe integer, got ${String(ctx.escalationStepMs)}`,
    );
  }
}
