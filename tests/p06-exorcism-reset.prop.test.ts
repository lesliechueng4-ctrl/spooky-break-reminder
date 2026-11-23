// **Feature: spooky-break-reminder, Property 6: Exorcism and Away reset**
// **Validates: Requirements 1.5, 3.6, 13.4, 13.5, 29.6**
//
// For any SchedulerState, completing a Ritual, or ending an Away_Period whose length is at least
// Natural_Break_Duration, yields Calm_State with Work_Elapsed 0, level 0, no Ritual and no Snooze.
// The Away_Period case also yields Break_Counter 0 and keeps an active Pause, which then resumes
// from Work_Elapsed 0. An Away_Period shorter than Natural_Break_Duration leaves the state unchanged.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbConfig, arbRun, type Run } from './arbitraries';
import {
  derive,
  nextBreakType,
  offeredRituals,
  reduce,
  type SchedulerConfig,
  type SchedulerState,
} from '../src/core/scheduler';
import { MINUTE_MS } from '../src/core/time';

/** Away_Period lengths above Natural_Break_Duration are drawn up to this extra length. */
const MAX_AWAY_EXTRA_MS = 60 * MINUTE_MS;

interface RitualCase {
  readonly kind: 'ritual';
  readonly run: Run;
  /** Picks one of the Rituals offered for the due break when no Ritual is running yet. */
  readonly pick: number;
}

interface AwayCase {
  readonly kind: 'away';
  readonly run: Run;
  readonly naturalBreakWallMs: number;
  readonly awayWallMs: number;
  /** Position of the resumed Work_Elapsed in [0, 1), scaled to [0, Work_Interval) in the check. */
  readonly fraction: number;
}

type Scenario = RitualCase | AwayCase;

/** A reachable schedule with a configuration (shared generators provide the states). */
const arbRunForAnyConfig: fc.Arbitrary<Run> = arbConfig.chain((cfg) => arbRun(cfg));

/** Position in [0, 1) for the resumed Work_Elapsed. */
const arbFraction: fc.Arbitrary<number> = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

/**
 * Away_Period lengths around Natural_Break_Duration (1 to 30 minutes), biased to the exact threshold
 * and its neighbours. The length is never negative.
 */
const arbAwayLengths: fc.Arbitrary<{ naturalBreakWallMs: number; awayWallMs: number }> = fc
  .record({
    naturalMinutes: fc.integer({ min: 1, max: 30 }),
    delta: fc.oneof(
      { weight: 2, arbitrary: fc.constantFrom(-1, 0, 1) },
      { weight: 1, arbitrary: fc.integer({ min: -30 * MINUTE_MS, max: MAX_AWAY_EXTRA_MS }) },
    ),
  })
  .map(({ naturalMinutes, delta }) => {
    const naturalBreakWallMs = naturalMinutes * MINUTE_MS;
    return { naturalBreakWallMs, awayWallMs: Math.max(0, naturalBreakWallMs + delta) };
  });

const arbScenario: fc.Arbitrary<Scenario> = fc.oneof(
  fc.record({
    kind: fc.constant<'ritual'>('ritual'),
    run: arbRunForAnyConfig,
    pick: fc.nat({ max: 2 }),
  }),
  fc.record({
    kind: fc.constant<'away'>('away'),
    run: arbRunForAnyConfig,
    lengths: arbAwayLengths,
    fraction: arbFraction,
  }).map(({ kind, run, lengths, fraction }): AwayCase => ({
    kind,
    run,
    naturalBreakWallMs: lengths.naturalBreakWallMs,
    awayWallMs: lengths.awayWallMs,
    fraction,
  })),
);

/** Starts the Ritual offered for the break that is due: the Haunting's break, or the next break in Calm_State. */
function startOfferedRitual(s: SchedulerState, cfg: SchedulerConfig, pick: number): SchedulerState {
  if (s.ritual !== null) return s;
  const haunting = s.phase.kind === 'haunting' ? s.phase : null;
  const origin: 'haunting' | 'early' = haunting !== null ? 'haunting' : 'early';
  const breakType =
    haunting !== null ? haunting.breakType : nextBreakType(s.breakCounter, cfg.longBreakFrequency);
  const offered = offeredRituals(breakType);
  const kind = offered[pick % offered.length];
  return reduce(s, { type: 'ritualStarted', kind, origin }, cfg).state;
}

/** Calm_State with Work_Elapsed 0, level 0, no Ritual and no Snooze (Property 6, first clause). */
function expectCalmReset(s: SchedulerState, cfg: SchedulerConfig): void {
  const view = derive(s, cfg);
  expect(view.phase).toBe('calm');
  expect(view.level).toBe(0);
  expect(s.phase).toMatchObject({ kind: 'calm', workElapsedMs: 0 });
  expect(s.phase).not.toHaveProperty('snoozeRemainingMs');
  expect(s.ritual).toBeNull();
}

function checkRitualCompletion(c: RitualCase): void {
  const { config } = c.run;
  const before = startOfferedRitual(c.run.state, config, c.pick);
  const { state, events } = reduce(before, { type: 'ritualCompleted' }, config);

  expectCalmReset(state, config);
  expect(events).toEqual([expect.objectContaining({ type: 'ritualExorcism' })]);
}

function checkAwayEnded(c: AwayCase): void {
  const { config } = c.run;
  const before = c.run.state;
  const event = {
    type: 'awayEnded' as const,
    awayWallMs: c.awayWallMs,
    naturalBreakWallMs: c.naturalBreakWallMs,
  };
  const { state, events } = reduce(before, event, config);

  if (c.awayWallMs < c.naturalBreakWallMs) {
    // A shorter Away_Period changes nothing (Property 6, last clause).
    expect(state).toEqual(before);
    expect(events).toEqual([]);
    return;
  }

  expectCalmReset(state, config);
  expect(state.breakCounter).toBe(0);
  expect(events).toEqual([
    expect.objectContaining({ type: before.phase.kind === 'haunting' ? 'awayExorcism' : 'awayReset' }),
  ]);

  // A Pause that was active survives the reset unchanged (Property 6, Away clause).
  const beforePause = before.phase.kind === 'calm' ? before.phase.pause : null;
  const afterPause = state.phase.kind === 'calm' ? state.phase.pause : null;
  expect(afterPause).toEqual(beforePause);

  // Work_Elapsed then grows from 0 when the Pause ends (expiry or Resume).
  const workIntervalMs = config.workIntervalMs;
  const resumedMs = Math.floor(c.fraction * workIntervalMs);
  let resumed: SchedulerState;
  if (afterPause === null) {
    resumed = reduce(state, { type: 'advance', dt: resumedMs }, config).state;
  } else if (afterPause.remainingMs === null) {
    const released = reduce(state, { type: 'resume' }, config).state;
    resumed = reduce(released, { type: 'advance', dt: resumedMs }, config).state;
  } else {
    const dt = afterPause.remainingMs + resumedMs;
    resumed = reduce(state, { type: 'advance', dt }, config).state;
  }
  expect(resumed.phase).toMatchObject({ kind: 'calm', workElapsedMs: resumedMs, pause: null });
}

describe('Property 6: Exorcism and Away reset', () => {
  it('completing a Ritual or ending a long enough Away_Period resets to Calm_State, and a shorter one changes nothing', () => {
    fc.assert(
      fc.property(arbScenario, (scenario) => {
        if (scenario.kind === 'ritual') {
          checkRitualCompletion(scenario);
        } else {
          checkAwayEnded(scenario);
        }
      }),
      { numRuns: 200 },
    );
  });
});
