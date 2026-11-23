// Shared fast-check generators for the core properties (tech steering: arbConfig, arbState, arbEvents).
//
// Event sequences are resolved against the live Scheduler state while they are built. An `advance`
// step can therefore target an exact boundary (the remaining Work_Interval, the remaining Pause or the
// remaining Snooze). Every state is produced by folding a generated event list from the initial state,
// so every generated state is reachable. Property-specific generators stay in their own test files.

import * as fc from 'fast-check';
import {
  initialState,
  nextBreakType,
  offeredRituals,
  reduce,
  type RitualKind,
  type SchedulerConfig,
  type SchedulerEvent,
  type SchedulerState,
} from '../src/core/scheduler';
import { MINUTE_MS, SPEED } from '../src/core/time';

const HOUR_MS = 60 * MINUTE_MS;
/** Largest `advance` duration generated (design: arbEvents, 0 ms to 3 h). */
const MAX_ADVANCE_MS = 3 * HOUR_MS;

/** A reachable schedule: the configuration in effect at the end, the state and the events that produced it. */
export interface Run {
  readonly config: SchedulerConfig;
  readonly state: SchedulerState;
  readonly events: SchedulerEvent[];
}

const RITUAL_KINDS: readonly RitualKind[] = ['eye', 'breathing', 'stretch'];

/** Integer in [min, max] that favours both bounds. */
function arbBoundedInt(min: number, max: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(min, max) },
    { weight: 1, arbitrary: fc.integer({ min, max }) },
  );
}

/**
 * A schedule configuration inside the Settings ranges (Requirements 1.1, 3.3, 11.1). The Snooze_Duration is a
 * wall-clock length. The speed is 1 (normal use) or 60 (Demo_Mode), so both Snooze conversions are generated (25.3, 25.4).
 */
export const arbConfig: fc.Arbitrary<SchedulerConfig> = fc.record({
  workIntervalMs: arbBoundedInt(5, 90).map((minutes) => minutes * MINUTE_MS),
  longBreakFrequency: arbBoundedInt(1, 10),
  escalationStepMs: arbBoundedInt(1, 10).map((minutes) => minutes * MINUTE_MS),
  snoozeMs: arbBoundedInt(1, 15).map((minutes) => minutes * MINUTE_MS),
  speed: fc.constantFrom(SPEED.normal, SPEED.demo),
});

/** Advance durations: boundary-adjacent values for this configuration, plus any value from 0 to 3 h. */
function arbAmountMs(cfg: SchedulerConfig): fc.Arbitrary<number> {
  const w = cfg.workIntervalMs;
  // The Snooze boundary is in schedule time: its wall-clock length times the speed.
  const snoozeScheduleMs = cfg.snoozeMs * cfg.speed;
  const edges = [0, 1, cfg.escalationStepMs, snoozeScheduleMs, w - 1, w, w + 1, 2 * w].map((ms) =>
    Math.min(ms, MAX_ADVANCE_MS),
  );
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...edges) },
    { weight: 1, arbitrary: fc.integer({ min: 0, max: MAX_ADVANCE_MS }) },
  );
}

/** Pause durations the UI offers (Requirement 12.1): 30, 60 or 120 minutes, or until resumed (null). */
const arbPauseMs: fc.Arbitrary<number | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<number | null>(null) },
  { weight: 3, arbitrary: fc.constantFrom(30, 60, 120).map((minutes) => minutes * MINUTE_MS) },
);

/** Away_Period lengths around Natural_Break_Duration (1 to 30 minutes), including the exact threshold. */
const arbAwayEnded: fc.Arbitrary<SchedulerEvent> = fc
  .record({
    naturalMinutes: arbBoundedInt(1, 30),
    offset: fc.oneof(
      { weight: 2, arbitrary: fc.constantFrom(-1, 0, 1) },
      { weight: 1, arbitrary: fc.integer({ min: -5 * MINUTE_MS, max: 40 * MINUTE_MS }) },
    ),
  })
  .map(({ naturalMinutes, offset }): SchedulerEvent => {
    const naturalBreakWallMs = naturalMinutes * MINUTE_MS;
    return {
      type: 'awayEnded',
      awayWallMs: Math.max(0, naturalBreakWallMs + offset),
      naturalBreakWallMs,
    };
  });

/**
 * One generation step. An `advance` step takes a fixed amount, or, when `toBoundary` is set, the
 * distance to the next boundary of the state at that point. A `ritualRun` step starts the offered
 * Ritual and completes it at once, which is how a break ends (Ritual_Exorcism). Other steps are
 * single fixed events.
 */
type Step =
  | { readonly kind: 'advance'; readonly toBoundary: boolean; readonly amountMs: number }
  | { readonly kind: 'ritualRun'; readonly pick: number }
  | { readonly kind: 'event'; readonly event: SchedulerEvent };

function arbStep(cfg: SchedulerConfig): fc.Arbitrary<Step> {
  const fixed = (event: SchedulerEvent): Step => ({ kind: 'event', event });
  return fc.oneof(
    {
      weight: 6,
      arbitrary: fc.record({
        kind: fc.constant<'advance'>('advance'),
        toBoundary: fc.boolean(),
        amountMs: arbAmountMs(cfg),
      }),
    },
    {
      weight: 3,
      arbitrary: fc.nat({ max: 1 }).map((pick): Step => ({ kind: 'ritualRun', pick })),
    },
    { weight: 2, arbitrary: fc.constant(fixed({ type: 'snooze' })) },
    {
      weight: 1,
      arbitrary: arbPauseMs.map((durationMs) => fixed({ type: 'pause', durationMs })),
    },
    { weight: 1, arbitrary: fc.constant(fixed({ type: 'resume' })) },
    {
      weight: 2,
      arbitrary: fc
        .tuple(fc.constantFrom(...RITUAL_KINDS), fc.constantFrom('early' as const, 'haunting' as const))
        .map(([kind, origin]) => fixed({ type: 'ritualStarted', kind, origin })),
    },
    { weight: 2, arbitrary: fc.constant(fixed({ type: 'ritualCompleted' })) },
    { weight: 1, arbitrary: fc.constant(fixed({ type: 'ritualEnded' })) },
    { weight: 1, arbitrary: arbAwayEnded.map(fixed) },
    { weight: 1, arbitrary: fc.constant(fixed({ type: 'jumpScarePresented' })) },
    {
      weight: 1,
      // A page keeps its speed for its whole life, so a configuration change keeps the speed of the run.
      arbitrary: arbConfig.map((config) =>
        fixed({ type: 'configChanged', config: { ...config, speed: cfg.speed } }),
      ),
    },
  );
}

/** Distance from the state to its next boundary, or null when the state has no pending boundary. */
function distanceToBoundary(state: SchedulerState, cfg: SchedulerConfig): number | null {
  const { phase } = state;
  if (phase.kind === 'calm') {
    if (phase.pause !== null) return phase.pause.remainingMs;
    return cfg.workIntervalMs - phase.workElapsedMs;
  }
  return phase.snoozeRemainingMs > 0 ? phase.snoozeRemainingMs : null;
}

/**
 * Turns generated steps into concrete events. Each `advance` that targets a boundary is resolved
 * against the state reached so far, so the returned list replays to the same states.
 */
function resolveSteps(cfg: SchedulerConfig, steps: readonly Step[]): SchedulerEvent[] {
  let config = cfg;
  let state = initialState();
  const events: SchedulerEvent[] = [];
  const apply = (event: SchedulerEvent): void => {
    if (event.type === 'configChanged') config = event.config;
    state = reduce(state, event, config).state;
    events.push(event);
  };

  for (const step of steps) {
    if (step.kind === 'advance') {
      const boundary = step.toBoundary ? distanceToBoundary(state, config) : null;
      apply({ type: 'advance', dt: Math.min(boundary ?? step.amountMs, MAX_ADVANCE_MS) });
    } else if (step.kind === 'ritualRun') {
      // The Ritual offered for the break that is due: the Haunting's break, or the next break in Calm_State.
      const haunting = state.phase.kind === 'haunting' ? state.phase : null;
      const breakType = haunting !== null
        ? haunting.breakType
        : nextBreakType(state.breakCounter, config.longBreakFrequency);
      const offered = offeredRituals(breakType);
      const kind = offered[step.pick % offered.length];
      apply({ type: 'ritualStarted', kind, origin: haunting !== null ? 'haunting' : 'early' });
      apply({ type: 'ritualCompleted' });
    } else {
      apply(step.event);
    }
  }
  return events;
}

/**
 * Folds an event list from the initial state under `cfg`. `configChanged` events update the
 * configuration in effect, so the returned `config` is the one the final state must be read with.
 */
export function foldRun(cfg: SchedulerConfig, events: readonly SchedulerEvent[]): Run {
  let config = cfg;
  let state = initialState();
  for (const event of events) {
    if (event.type === 'configChanged') config = event.config;
    state = reduce(state, event, config).state;
  }
  return { config, state, events: [...events] };
}

/**
 * Event sequences for a schedule that starts under `cfg`, with up to `maxLength` steps. Advance
 * durations follow the boundaries of the state reached so far.
 */
export function arbEvents(cfg: SchedulerConfig, maxLength = 40): fc.Arbitrary<SchedulerEvent[]> {
  return fc.array(arbStep(cfg), { maxLength }).map((steps) => resolveSteps(cfg, steps));
}

/**
 * Reachable states under `cfg`: `arbState(cfg)` folds `arbEvents(cfg)` from the initial state, so
 * every generated state can occur. Use `arbRun` when the configuration in effect is also needed.
 */
export function arbState(cfg: SchedulerConfig, maxLength = 40): fc.Arbitrary<SchedulerState> {
  return arbEvents(cfg, maxLength).map((events) => foldRun(cfg, events).state);
}

/** A reachable schedule with the configuration in effect at its end. */
export function arbRun(cfg: SchedulerConfig, maxLength = 40): fc.Arbitrary<Run> {
  return arbEvents(cfg, maxLength).map((events) => foldRun(cfg, events));
}
