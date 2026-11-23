// Scheduler state machine (design: "Core: Scheduler"; Requirements 1, 2, 3, 7, 11, 12, 13).
// Pure core: no clock, no random source, no DOM, no timers. Every function takes explicit
// durations in integer milliseconds and returns new state. Inputs are never mutated.

import type { BreakType, CalmPhase, HauntPhase } from './persistence';
import { createRng } from './rng';
import type { Settings } from './settings';
import { MINUTE_MS, type Speed } from './time';

export type { BreakType } from './persistence';

export type RitualKind = 'eye' | 'breathing' | 'stretch';
export type RitualOrigin = 'early' | 'haunting';
export type HauntingLevel = 1 | 2 | 3 | 4 | 5;

/** Snoozes allowed in one Haunting (Requirement 11.1, 11.8). */
export const MAX_SNOOZES_PER_HAUNTING = 3;

/**
 * Snapshot of Settings, passed to every call. `workIntervalMs` and `escalationStepMs` are schedule milliseconds.
 * `snoozeMs` is the Snooze_Duration in wall-clock milliseconds: the Scheduler converts it with `speed`, so a Snooze
 * lasts its stated wall-clock time in every mode (Requirement 25.4).
 */
export interface SchedulerConfig {
  readonly workIntervalMs: number;
  readonly longBreakFrequency: number;
  readonly escalationStepMs: number;
  readonly snoozeMs: number;
  /** Schedule milliseconds per wall-clock millisecond (Requirement 25.3). */
  readonly speed: Speed;
}

export type SchedulerEvent =
  | { type: 'advance'; dt: number }
  | { type: 'snooze' }
  /** `durationMs` is a wall-clock length; null means until resumed. */
  | { type: 'pause'; durationMs: number | null }
  | { type: 'resume' }
  | { type: 'ritualStarted'; kind: RitualKind; origin: RitualOrigin }
  | { type: 'ritualCompleted' }
  | { type: 'ritualEnded' }
  | { type: 'awayEnded'; awayWallMs: number; naturalBreakWallMs: number }
  | { type: 'jumpScarePresented' }
  | { type: 'configChanged'; config: SchedulerConfig };

export type DomainEvent =
  | { type: 'hauntingStarted'; breakType: BreakType }
  | { type: 'snoozeStarted' }
  | { type: 'snoozeEnded' }
  | { type: 'pauseEnded' }
  | { type: 'ritualExorcism'; kind: RitualKind; breakType: BreakType }
  | { type: 'awayExorcism' }
  | { type: 'awayReset' };

/** The stored schedule fields plus the transient Ritual, which is never persisted. */
export interface SchedulerState {
  phase: CalmPhase | HauntPhase;
  /** Invariant: 0 <= breakCounter < longBreakFrequency. */
  breakCounter: number;
  /** The break type is fixed when the Ritual starts, so completion does not depend on later config changes (26.1). */
  ritual: { kind: RitualKind; origin: RitualOrigin; breakType: BreakType } | null;
}

export interface SchedulerResult {
  readonly state: SchedulerState;
  readonly events: DomainEvent[];
}

/**
 * Derived, never stored. The UI and the output adapters read this. The candle and the escalation fields are schedule
 * milliseconds. The Snooze and Pause fields are wall-clock milliseconds, rounded up, so a countdown reaches zero at the
 * wall-clock moment the Snooze or Pause ends.
 */
export type ScheduleView =
  | {
      phase: 'calm';
      level: 0;
      remainingMs: number;
      candleFraction: number;
      nextBreak: BreakType;
      /** Pause countdown in wall-clock ms; `remainingMs` is null when the Pause lasts until resumed. */
      pause: null | { remainingMs: number | null };
      ritual: RitualKind | null;
    }
  | {
      phase: 'haunting';
      level: HauntingLevel;
      breakType: BreakType;
      overdueMs: number;
      overdueWholeMin: number;
      /** The Haunting's Escalation_Step snapshot. The level, the fog and the ghost all use this value (3.3, 3.5). */
      escalationStepMs: number;
      offered: RitualKind[];
      snoozesLeft: number;
      /** The Haunting's Snooze_Duration snapshot in wall-clock ms (11.1). */
      snoozeMs: number;
      /** Snooze countdown in wall-clock ms. Zero when no Snooze runs. */
      snoozeRemainingMs: number;
      jumpScareShown: boolean;
      ritual: RitualKind | null;
    };

/**
 * Converts the schedule-related Settings (whole minutes) to the Scheduler config. Snooze_Duration stays a wall-clock
 * length, so the Scheduler can convert it with `speed`.
 */
export function schedulerConfigFor(
  s: Pick<Settings, 'workIntervalMin' | 'longBreakFrequency' | 'escalationStepMin' | 'snoozeMin'>,
  speed: Speed,
): SchedulerConfig {
  return {
    workIntervalMs: s.workIntervalMin * MINUTE_MS,
    longBreakFrequency: s.longBreakFrequency,
    escalationStepMs: s.escalationStepMin * MINUTE_MS,
    snoozeMs: s.snoozeMin * MINUTE_MS,
    speed,
  };
}

/** Wall-clock milliseconds for a schedule duration, rounded up so a countdown never shows zero early (25.4). */
function wallCeilMs(scheduleMs: number, speed: Speed): number {
  return Math.ceil(scheduleMs / speed);
}

/** A Scheduler in Calm_State with no Pause, no Ritual and Break_Counter 0. */
export function initialState(): SchedulerState {
  return { phase: { kind: 'calm', workElapsedMs: 0, pause: null }, breakCounter: 0, ritual: null };
}

/** Haunting_Level for an Overdue_Duration: min(5, 1 + whole Escalation_Steps overdue) (Requirement 3.3). */
export function levelFor(overdueMs: number, stepMs: number): HauntingLevel {
  assertNonNegativeMs(overdueMs, 'overdueMs');
  assertPositive(stepMs, 'stepMs');
  return Math.min(5, 1 + Math.floor(overdueMs / stepMs)) as HauntingLevel;
}

/** Long_Break when Break_Counter plus 1 equals the frequency, otherwise Micro_Break (Requirement 1.2). */
export function nextBreakType(breakCounter: number, frequency: number): BreakType {
  return breakCounter + 1 === frequency ? 'long' : 'micro';
}

/** Rituals offered for a break type (Requirements 7.1, 7.2). */
export function offeredRituals(breakType: BreakType): RitualKind[] {
  return breakType === 'micro' ? ['eye'] : ['breathing', 'stretch'];
}

/**
 * Moves the schedule forward by `dt` schedule milliseconds. The walk stops at every boundary
 * (Due_Time, Snooze end, Pause end), so one call with D gives the same state and events as any
 * sequence of calls whose durations add up to D (Property 1).
 */
export function advance(s: SchedulerState, dt: number, cfg: SchedulerConfig): SchedulerResult {
  assertNonNegativeMs(dt, 'dt');
  assertConfig(cfg);
  const st = cloneState(s);
  const events: DomainEvent[] = [];
  let left = dt;

  for (;;) {
    const phase = st.phase;

    if (phase.kind === 'calm') {
      if (phase.pause !== null) {
        const remaining = phase.pause.remainingMs;
        if (remaining === null) break; // paused until resumed: no time accrues (Requirement 12.2)
        if (remaining === 0) {
          // Expiry: Work_Elapsed resumes from the value recorded when the Pause started (12.5).
          st.phase = { ...phase, pause: null };
          events.push({ type: 'pauseEnded' });
          continue;
        }
        if (left === 0) break;
        const k = Math.min(left, remaining);
        phase.pause.remainingMs = remaining - k;
        left -= k;
        continue;
      }
      if (phase.workElapsedMs >= cfg.workIntervalMs) {
        startHaunting(st, cfg, events);
        continue;
      }
      if (left === 0) break;
      const k = Math.min(left, cfg.workIntervalMs - phase.workElapsedMs);
      phase.workElapsedMs += k;
      left -= k;
      continue;
    }

    // Haunting.
    if (st.ritual !== null) break; // a Ritual freezes Overdue_Duration (3.4)
    if (phase.snoozeRemainingMs > 0) {
      if (left === 0) break;
      const k = Math.min(left, phase.snoozeRemainingMs);
      phase.snoozeRemainingMs -= k;
      phase.overdueMs += k; // a Snooze keeps accruing Overdue_Duration (11.3)
      left -= k;
      if (phase.snoozeRemainingMs === 0) events.push({ type: 'snoozeEnded' });
      continue;
    }
    if (left > 0) phase.overdueMs += left;
    break;
  }

  return { state: st, events };
}

/** Applies one event. Events whose precondition does not hold leave the state unchanged. */
export function reduce(s: SchedulerState, e: SchedulerEvent, cfg: SchedulerConfig): SchedulerResult {
  assertConfig(cfg);
  switch (e.type) {
    case 'advance':
      return advance(s, e.dt, cfg);
    case 'snooze':
      return snooze(s);
    case 'pause':
      return pause(s, e.durationMs, cfg);
    case 'resume':
      return resume(s, cfg);
    case 'ritualStarted':
      return startRitual(s, e.kind, e.origin, cfg);
    case 'ritualCompleted':
      return completeRitual(s, cfg);
    case 'ritualEnded':
      return endRitual(s);
    case 'awayEnded':
      return awayEnded(s, e.awayWallMs, e.naturalBreakWallMs);
    case 'jumpScarePresented':
      return presentJumpScare(s);
    case 'configChanged':
      return configChanged(s, e.config);
  }
}

/** Derives the view for the UI. Calm uses the current config; a Haunting uses its own snapshots. */
export function derive(s: SchedulerState, cfg: SchedulerConfig): ScheduleView {
  assertConfig(cfg);
  const ritual = s.ritual === null ? null : s.ritual.kind;

  if (s.phase.kind === 'calm') {
    const phase = s.phase;
    const remainingMs = Math.max(0, cfg.workIntervalMs - phase.workElapsedMs);
    return {
      phase: 'calm',
      level: 0,
      remainingMs,
      candleFraction: remainingMs / cfg.workIntervalMs,
      nextBreak: nextBreakType(s.breakCounter, cfg.longBreakFrequency),
      pause:
        phase.pause === null
          ? null
          : {
              remainingMs:
                phase.pause.remainingMs === null ? null : wallCeilMs(phase.pause.remainingMs, cfg.speed),
            },
      ritual,
    };
  }

  const h = s.phase;
  return {
    phase: 'haunting',
    level: levelFor(h.overdueMs, h.escalationStepMs),
    breakType: h.breakType,
    overdueMs: h.overdueMs,
    overdueWholeMin: Math.floor(h.overdueMs / MINUTE_MS),
    escalationStepMs: h.escalationStepMs,
    offered: offeredRituals(h.breakType),
    snoozesLeft: MAX_SNOOZES_PER_HAUNTING - h.snoozesUsed,
    snoozeMs: h.snoozeMs / cfg.speed,
    snoozeRemainingMs: wallCeilMs(h.snoozeRemainingMs, cfg.speed),
    jumpScareShown: h.jumpScareShown,
    ritual,
  };
}

function snooze(s: SchedulerState): SchedulerResult {
  const st = cloneState(s);
  const phase = st.phase;
  if (
    phase.kind !== 'haunting' ||
    st.ritual !== null ||
    phase.snoozesUsed >= MAX_SNOOZES_PER_HAUNTING ||
    phase.snoozeRemainingMs > 0
  ) {
    return { state: st, events: [] };
  }
  st.phase = {
    ...phase,
    snoozesUsed: (phase.snoozesUsed + 1) as 1 | 2 | 3,
    snoozeRemainingMs: phase.snoozeMs,
  };
  return { state: st, events: [{ type: 'snoozeStarted' }] };
}

/** Starts a Pause. `durationMs` is wall-clock time, so the stored countdown is `durationMs x speed` of schedule time. */
function pause(s: SchedulerState, durationMs: number | null, cfg: SchedulerConfig): SchedulerResult {
  if (durationMs !== null) assertPositive(durationMs, 'durationMs');
  const st = cloneState(s);
  if (st.phase.kind === 'calm' && st.ritual === null && st.phase.pause === null) {
    const remainingMs = durationMs === null ? null : durationMs * cfg.speed;
    st.phase = { ...st.phase, pause: { remainingMs } };
  }
  return { state: st, events: [] };
}

function resume(s: SchedulerState, cfg: SchedulerConfig): SchedulerResult {
  const st = cloneState(s);
  if (st.phase.kind !== 'calm' || st.phase.pause === null) return { state: st, events: [] };
  st.phase = { ...st.phase, pause: null };
  // The Haunting start after a Resume belongs to the advance loop (Requirement 12.7).
  const after = advance(st, 0, cfg);
  return { state: after.state, events: [{ type: 'pauseEnded' }, ...after.events] };
}

function startRitual(
  s: SchedulerState,
  kind: RitualKind,
  origin: RitualOrigin,
  cfg: SchedulerConfig,
): SchedulerResult {
  const st = cloneState(s);
  if (st.ritual !== null) return { state: st, events: [] };
  const breakType =
    st.phase.kind === 'haunting'
      ? st.phase.breakType
      : nextBreakType(st.breakCounter, cfg.longBreakFrequency);
  if (!offeredRituals(breakType).includes(kind)) return { state: st, events: [] };

  st.ritual = { kind, origin, breakType };
  // Starting a Ritual ends an active Snooze and keeps it counted (11.9). No snoozeEnded is emitted (15.2).
  if (st.phase.kind === 'haunting') st.phase = { ...st.phase, snoozeRemainingMs: 0 };
  return { state: st, events: [] };
}

function completeRitual(s: SchedulerState, cfg: SchedulerConfig): SchedulerResult {
  const st = cloneState(s);
  if (st.ritual === null) return { state: st, events: [] };

  // The break type stored at ritualStarted is used for both origins. For a Haunting Ritual it equals
  // the Haunting's breakType, which does not change while the Haunting runs. For an early Ritual it
  // is the break the user started, even if a configChanged or a Haunting start happened since.
  const { kind, breakType } = st.ritual;
  // The cap keeps the invariant 0 <= Break_Counter < frequency if the frequency was lowered mid-Haunting.
  const breakCounter =
    breakType === 'long' ? 0 : Math.min(st.breakCounter + 1, cfg.longBreakFrequency - 1);
  const pause = st.phase.kind === 'calm' ? st.phase.pause : null;

  return {
    state: {
      phase: { kind: 'calm', workElapsedMs: 0, pause },
      breakCounter,
      ritual: null,
    },
    events: [{ type: 'ritualExorcism', kind, breakType }],
  };
}

function endRitual(s: SchedulerState): SchedulerResult {
  const st = cloneState(s);
  if (st.ritual === null) return { state: st, events: [] };
  return { state: { ...st, ritual: null }, events: [] };
}

function awayEnded(s: SchedulerState, awayWallMs: number, naturalBreakWallMs: number): SchedulerResult {
  assertNonNegativeMs(awayWallMs, 'awayWallMs');
  assertNonNegativeMs(naturalBreakWallMs, 'naturalBreakWallMs');
  const st = cloneState(s);
  if (awayWallMs < naturalBreakWallMs) return { state: st, events: [] };

  const event: DomainEvent = st.phase.kind === 'haunting' ? { type: 'awayExorcism' } : { type: 'awayReset' };
  // A Pause is kept, and its remaining time resumes from the reset Work_Elapsed (13.4).
  const pause = st.phase.kind === 'calm' ? st.phase.pause : null;
  return {
    state: { phase: { kind: 'calm', workElapsedMs: 0, pause }, breakCounter: 0, ritual: null },
    events: [event],
  };
}

function presentJumpScare(s: SchedulerState): SchedulerResult {
  const st = cloneState(s);
  if (st.phase.kind === 'haunting' && !st.phase.jumpScareShown) {
    st.phase = { ...st.phase, jumpScareShown: true };
  }
  return { state: st, events: [] };
}

function configChanged(s: SchedulerState, config: SchedulerConfig): SchedulerResult {
  assertConfig(config);
  const st = cloneState(s);
  if (st.phase.kind === 'calm') {
    st.phase = {
      ...st.phase,
      workElapsedMs: Math.min(st.phase.workElapsedMs, config.workIntervalMs),
    };
  }
  st.breakCounter = Math.min(st.breakCounter, config.longBreakFrequency - 1);
  // A zero-length advance starts a Haunting when the clamp reached the Due_Time while unpaused (1.9).
  return advance(st, 0, config);
}

function startHaunting(st: SchedulerState, cfg: SchedulerConfig, events: DomainEvent[]): void {
  const breakType = nextBreakType(st.breakCounter, cfg.longBreakFrequency);
  st.phase = {
    kind: 'haunting',
    breakType,
    overdueMs: 0,
    escalationStepMs: cfg.escalationStepMs,
    // The Snooze_Duration snapshot in schedule ms: its wall-clock length times the speed (25.4).
    snoozeMs: cfg.snoozeMs * cfg.speed,
    snoozesUsed: 0,
    snoozeRemainingMs: 0,
    jumpScareShown: false,
    seed: hauntSeed(st.breakCounter, cfg),
  };
  events.push({ type: 'hauntingStarted', breakType });
}

/**
 * Seed for the crack layout and the Whisper randomness of a new Haunting. It is a pure function
 * of the schedule, so a replay gives the same layout. Consecutive Hauntings with the same
 * Break_Counter and settings share a seed.
 */
function hauntSeed(breakCounter: number, cfg: SchedulerConfig): number {
  return createRng(breakCounter * 1_000_003 + cfg.longBreakFrequency).nextInt(0, 0x7fffffff);
}

function cloneState(s: SchedulerState): SchedulerState {
  const phase: CalmPhase | HauntPhase =
    s.phase.kind === 'calm'
      ? { ...s.phase, pause: s.phase.pause === null ? null : { ...s.phase.pause } }
      : { ...s.phase };
  return {
    phase,
    breakCounter: s.breakCounter,
    ritual: s.ritual === null ? null : { ...s.ritual },
  };
}

function assertNonNegativeMs(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of milliseconds, got ${value}`);
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer, got ${value}`);
  }
}

function assertConfig(cfg: SchedulerConfig): void {
  assertPositive(cfg.workIntervalMs, 'workIntervalMs');
  assertPositive(cfg.longBreakFrequency, 'longBreakFrequency');
  assertPositive(cfg.escalationStepMs, 'escalationStepMs');
  assertPositive(cfg.snoozeMs, 'snoozeMs');
  assertPositive(cfg.speed, 'speed');
}
