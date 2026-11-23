// Example tests for the Demo_Mode countdowns (Requirements 25.3, 25.4). The Work_Interval candle and the escalation
// run on schedule time, 60 times faster than the clock. The Snooze and the Pause last their wall-clock length.
// Property 10 covers the clock arithmetic (scheduleDelta); these examples cover the Scheduler and its storage.
import { describe, expect, it } from 'vitest';
import { parseStored, serialize, type PersistedSchedule } from '../src/core/persistence';
import {
  advance,
  derive,
  initialState,
  reduce,
  schedulerConfigFor,
  type SchedulerConfig,
  type SchedulerState,
} from '../src/core/scheduler';
import { MINUTE_MS, SPEED, scheduleDelta, speedFor } from '../src/core/time';

const demoConfig: SchedulerConfig = {
  workIntervalMs: 20 * MINUTE_MS,
  longBreakFrequency: 3,
  escalationStepMs: 2 * MINUTE_MS,
  snoozeMs: 5 * MINUTE_MS,
  speed: SPEED.demo,
};

/** Advances a Demo_Mode schedule by a wall-clock duration: the schedule moves by that time times the speed. */
function wallAdvance(s: SchedulerState, wallMs: number, cfg: SchedulerConfig = demoConfig): SchedulerState {
  return advance(s, scheduleDelta(0, wallMs, cfg.speed), cfg).state;
}

describe('Demo_Mode countdowns (Requirements 25.3, 25.4)', () => {
  it('maps the settings to a config that keeps Snooze_Duration in wall-clock time and carries the speed', () => {
    expect(speedFor(true)).toBe(SPEED.demo);
    expect(speedFor(false)).toBe(SPEED.normal);
    expect(
      schedulerConfigFor(
        { workIntervalMin: 20, longBreakFrequency: 3, escalationStepMin: 2, snoozeMin: 5 },
        SPEED.demo,
      ),
    ).toEqual(demoConfig);
  });

  it('runs the candle at 60 times wall-clock speed: a full Work_Interval passes in 20 wall-clock seconds', () => {
    expect(derive(wallAdvance(initialState(), 19_999), demoConfig)).toMatchObject({
      phase: 'calm',
      remainingMs: 60,
    });
    expect(derive(wallAdvance(initialState(), 20_000), demoConfig)).toMatchObject({
      phase: 'haunting',
      level: 1,
    });
  });

  it('runs the escalation at 60 times wall-clock speed: level 5 is reached about 28 seconds after the start', () => {
    // 20 min of Work_Interval plus 8 min of overdue, that is 28 s of wall-clock time: level 1 + 8 / 2 = 5.
    expect(derive(wallAdvance(initialState(), 28_000), demoConfig)).toMatchObject({
      phase: 'haunting',
      level: 5,
      overdueWholeMin: 8,
    });
  });

  it('lasts a Demo_Mode Snooze for 5 minutes of wall-clock time, and its overdue time accrues at schedule speed', () => {
    let s = wallAdvance(initialState(), 20_000);
    s = reduce(s, { type: 'snooze' }, demoConfig).state;
    expect(derive(s, demoConfig)).toMatchObject({
      phase: 'haunting',
      snoozeMs: 5 * MINUTE_MS,
      snoozeRemainingMs: 5 * MINUTE_MS,
    });

    // 4 min 59 s of wall-clock time: the Snooze still runs with 1 s left, no snoozeEnded yet.
    const before = advance(s, scheduleDelta(0, 299_000, demoConfig.speed), demoConfig);
    expect(before.events).toEqual([]);
    expect(derive(before.state, demoConfig)).toMatchObject({ snoozeRemainingMs: 1_000 });

    // The last second of wall-clock time ends the Snooze.
    const ended = advance(before.state, scheduleDelta(0, 1_000, demoConfig.speed), demoConfig);
    expect(ended.events).toEqual([{ type: 'snoozeEnded' }]);
    expect(derive(ended.state, demoConfig)).toMatchObject({
      snoozeRemainingMs: 0,
      snoozesLeft: 2,
      // Overdue time accrued at 60 times the clock: 5 wall minutes is 300 schedule minutes (Requirement 11.3).
      overdueMs: 300 * MINUTE_MS,
    });
  });

  it('lasts a Demo_Mode Pause for 30 minutes of wall-clock time and keeps the candle still while it runs', () => {
    let s = reduce(initialState(), { type: 'pause', durationMs: 30 * MINUTE_MS }, demoConfig).state;
    expect(derive(s, demoConfig)).toMatchObject({
      pause: { remainingMs: 30 * MINUTE_MS },
      remainingMs: 20 * MINUTE_MS,
    });

    // 29 min 59 s of wall-clock time: the Pause has 1 s left and Work_Elapsed has not moved.
    s = wallAdvance(s, 29 * MINUTE_MS + 59_000);
    expect(derive(s, demoConfig)).toMatchObject({
      pause: { remainingMs: 1_000 },
      remainingMs: 20 * MINUTE_MS,
    });

    // The last second ends the Pause. The candle then runs from zero at 60 times wall-clock speed.
    const ended = advance(s, scheduleDelta(0, 1_000, demoConfig.speed), demoConfig);
    expect(ended.events).toEqual([{ type: 'pauseEnded' }]);
    expect(derive(ended.state, demoConfig)).toMatchObject({ pause: null, remainingMs: 20 * MINUTE_MS });
    expect(derive(wallAdvance(ended.state, 20_000), demoConfig)).toMatchObject({ phase: 'haunting', level: 1 });
  });

  it('keeps a Demo_Mode Pause until resumed open-ended, whatever the wall-clock time', () => {
    const paused = reduce(initialState(), { type: 'pause', durationMs: null }, demoConfig).state;
    expect(derive(wallAdvance(paused, 3 * 60 * MINUTE_MS), demoConfig)).toMatchObject({
      pause: { remainingMs: null },
      remainingMs: 20 * MINUTE_MS,
    });
  });

  it('stores a Demo_Mode Haunting with a Snooze and reads it back, so the reload keeps the Snooze', () => {
    let s = wallAdvance(initialState(), 20_000);
    s = reduce(s, { type: 'snooze' }, demoConfig).state;
    s = wallAdvance(s, 60_000);
    const record: PersistedSchedule = {
      state: { phase: s.phase, breakCounter: s.breakCounter },
      lastAliveWall: 0,
      frozenAtWall: null,
      awayOpenSinceWall: null,
    };

    expect(parseStored('schedule', serialize('schedule', record))).toEqual(record);
  });

  it('rejects a stored Snooze snapshot that is out of the Snooze_Duration range at both speeds', () => {
    let s = wallAdvance(initialState(), 20_000);
    s = reduce(s, { type: 'snooze' }, demoConfig).state;
    const record: PersistedSchedule = {
      state: { phase: s.phase, breakCounter: s.breakCounter },
      lastAliveWall: 0,
      frozenAtWall: null,
      awayOpenSinceWall: null,
    };
    // 16 minutes is above the 15-minute maximum at 1x and at 60x.
    const outOfRange = { ...record, state: { ...record.state, phase: { ...s.phase, snoozeMs: 16 * MINUTE_MS * SPEED.demo } } };

    expect(parseStored('schedule', serialize('schedule', outOfRange))).toBeNull();
  });
});
