// **Feature: spooky-break-reminder, Property 9: Pause time is excluded from Work_Elapsed**
// **Validates: Requirements 12.2, 12.5, 12.6, 29.5**
//
// For any Calm state with Work_Elapsed e, any Pause duration p (finite or until resumed) and any
// sequence of advances totalling t, Work_Elapsed stays e while the Pause is active. After the Pause
// ends by expiry or Resume, Work_Elapsed grows from e by exactly the time advanced after the end,
// until the Due_Time.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbConfig, arbRun, type Run } from './arbitraries';
import {
  derive,
  reduce,
  type SchedulerConfig,
  type SchedulerResult,
  type SchedulerState,
} from '../src/core/scheduler';
import { MINUTE_MS } from '../src/core/time';

const HOUR_MS = 60 * MINUTE_MS;
/** Largest advance generated, the same bound as the shared generators (3 h). */
const MAX_ADVANCE_MS = 3 * HOUR_MS;

type Step = { readonly kind: 'advance'; readonly dt: number } | { readonly kind: 'resume' };

/** A Calm state, the configuration in effect for it, the Pause length and the steps after the Pause starts. */
interface Scenario {
  readonly config: SchedulerConfig;
  readonly base: SchedulerState;
  readonly pauseMs: number | null;
  readonly steps: readonly Step[];
}

function calmWorkElapsed(state: SchedulerState): number {
  if (state.phase.kind !== 'calm') throw new Error('expected a Calm_State');
  return state.phase.workElapsedMs;
}

/**
 * Brings a reachable state to an unpaused Calm_State with no Ritual. A Ritual ends with `ritualEnded`,
 * a Haunting with an Away_Period of exactly Natural_Break_Duration (13.5) and an active Pause with
 * `resume`. Every step is a real event, so the result stays reachable.
 */
function toCalm(run: Run): SchedulerState {
  const cfg = run.config;
  let state = run.state;
  if (state.ritual !== null) state = reduce(state, { type: 'ritualEnded' }, cfg).state;
  if (state.phase.kind === 'haunting') {
    state = reduce(
      state,
      { type: 'awayEnded', awayWallMs: MINUTE_MS, naturalBreakWallMs: MINUTE_MS },
      cfg,
    ).state;
  }
  if (state.phase.kind === 'calm' && state.phase.pause !== null) {
    state = reduce(state, { type: 'resume' }, cfg).state;
  }
  if (state.phase.kind !== 'calm' || state.phase.pause !== null || state.ritual !== null) {
    throw new Error('expected an unpaused Calm_State without a Ritual');
  }
  return state;
}

/** Pause lengths: the UI offers 30, 60 and 120 minutes or until resumed (12.1); any positive length is valid. */
const arbPauseMs: fc.Arbitrary<number | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<number | null>(null) },
  { weight: 2, arbitrary: fc.constantFrom(30, 60, 120).map((minutes) => minutes * MINUTE_MS) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: MAX_ADVANCE_MS }) },
);

function clipAdvance(ms: number): number {
  return Math.min(Math.max(0, ms), MAX_ADVANCE_MS);
}

/**
 * Advance durations biased toward the Pause end and the Due_Time, plus any value from 0 to 3 h. The Pause end is a
 * schedule length: the Pause duration in wall-clock time times the speed (Requirement 25.4).
 */
function arbAdvanceMs(dueInMs: number, pauseScheduleMs: number | null): fc.Arbitrary<number> {
  const pauseEdges =
    pauseScheduleMs === null ? [] : [pauseScheduleMs - 1, pauseScheduleMs, pauseScheduleMs + 1, pauseScheduleMs + dueInMs];
  const edges = [0, 1, dueInMs - 1, dueInMs, dueInMs + 1, ...pauseEdges].map(clipAdvance);
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...edges) },
    { weight: 1, arbitrary: fc.integer({ min: 0, max: MAX_ADVANCE_MS }) },
  );
}

function arbStep(dueInMs: number, pauseScheduleMs: number | null): fc.Arbitrary<Step> {
  return fc.oneof(
    {
      weight: 6,
      arbitrary: arbAdvanceMs(dueInMs, pauseScheduleMs).map((dt): Step => ({ kind: 'advance', dt })),
    },
    { weight: 1, arbitrary: fc.constant<Step>({ kind: 'resume' }) },
  );
}

const arbScenario: fc.Arbitrary<Scenario> = arbConfig
  .chain((cfg) => arbRun(cfg))
  .chain((run) => {
    const base = toCalm(run);
    const dueInMs = run.config.workIntervalMs - calmWorkElapsed(base);
    return arbPauseMs.chain((pauseMs) => {
      const pauseScheduleMs = pauseMs === null ? null : pauseMs * run.config.speed;
      return fc.array(arbStep(dueInMs, pauseScheduleMs), { maxLength: 24 }).map(
        (steps): Scenario => ({ config: run.config, base, pauseMs, steps }),
      );
    });
  });

/**
 * While the Pause is active: Work_Elapsed is unchanged and the view shows the Pause remaining time. `pauseLeftMs` is
 * the schedule time left. The view reports it in wall-clock milliseconds, rounded up (Requirement 25.4).
 */
function expectPaused(
  state: SchedulerState,
  config: SchedulerConfig,
  workMs: number,
  pauseLeftMs: number | null,
): void {
  expect(state.phase.kind).toBe('calm');
  if (state.phase.kind !== 'calm') return;
  expect(state.phase.workElapsedMs).toBe(workMs);
  expect(state.phase.pause).toEqual({ remainingMs: pauseLeftMs });

  const view = derive(state, config);
  expect(view).toMatchObject({
    phase: 'calm',
    remainingMs: config.workIntervalMs - workMs,
    pause: { remainingMs: pauseLeftMs === null ? null : Math.ceil(pauseLeftMs / config.speed) },
  });
}

/**
 * After the Pause ended: Work_Elapsed equals the recorded value plus the time advanced after the end,
 * up to the Due_Time. Past the Due_Time the Haunting holds the excess as its Overdue_Duration.
 */
function expectAccrual(state: SchedulerState, config: SchedulerConfig, accruedMs: number): void {
  const dueMs = config.workIntervalMs;
  if (accruedMs < dueMs) {
    expect(state.phase.kind).toBe('calm');
    if (state.phase.kind === 'calm') {
      expect(state.phase.workElapsedMs).toBe(accruedMs);
      expect(state.phase.pause).toBeNull();
    }
  } else {
    expect(state.phase.kind).toBe('haunting');
    if (state.phase.kind === 'haunting') expect(state.phase.overdueMs).toBe(accruedMs - dueMs);
  }
}

/**
 * Replays a scenario with the real reducer and checks each step against a small model. The model
 * keeps the Pause time still to run (null when paused until resumed) and the time advanced after
 * the Pause ended.
 */
function checkPauseExclusion(s: Scenario): void {
  const { config, pauseMs, steps } = s;
  const workMs = calmWorkElapsed(s.base);

  let state = reduce(s.base, { type: 'pause', durationMs: pauseMs }, config).state;
  let paused = true;
  // The Pause time left in schedule ms: the wall-clock duration times the speed.
  let pauseLeftMs: number | null = pauseMs === null ? null : pauseMs * config.speed;
  let afterEndMs = 0;
  expectPaused(state, config, workMs, pauseLeftMs);

  for (const step of steps) {
    let endsNow = false;
    let result: SchedulerResult;

    if (step.kind === 'advance') {
      result = reduce(state, { type: 'advance', dt: step.dt }, config);
      if (!paused) {
        afterEndMs += step.dt;
      } else if (pauseLeftMs !== null && step.dt >= pauseLeftMs) {
        // Expiry inside this advance: the rest of the advance counts as work after the end (12.5).
        endsNow = true;
        afterEndMs += step.dt - pauseLeftMs;
        paused = false;
        pauseLeftMs = null;
      } else if (pauseLeftMs !== null) {
        pauseLeftMs -= step.dt;
      }
    } else {
      result = reduce(state, { type: 'resume' }, config);
      if (paused) {
        endsNow = true;
        paused = false;
        pauseLeftMs = null;
      }
    }

    const pauseEndedEvents = result.events.filter((event) => event.type === 'pauseEnded').length;
    expect(pauseEndedEvents, `pauseEnded events for step ${JSON.stringify(step)}`).toBe(endsNow ? 1 : 0);

    state = result.state;
    if (paused) {
      expectPaused(state, config, workMs, pauseLeftMs);
    } else {
      expectAccrual(state, config, workMs + afterEndMs);
    }
  }
}

describe('Property 9: Pause time is excluded from Work_Elapsed', () => {
  it('keeps Work_Elapsed during a Pause and resumes it from the recorded value when the Pause ends', () => {
    fc.assert(
      fc.property(arbScenario, (scenario) => {
        checkPauseExclusion(scenario);
      }),
      { numRuns: 200 },
    );
  });
});
