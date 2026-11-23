import { describe, expect, it } from 'vitest';
import { advance, derive, initialState, reduce, type SchedulerConfig } from '../src/core/scheduler';
import { MINUTE_MS, SPEED } from '../src/core/time';

const config: SchedulerConfig = {
  workIntervalMs: 20 * MINUTE_MS,
  longBreakFrequency: 3,
  escalationStepMs: 2 * MINUTE_MS,
  snoozeMs: 5 * MINUTE_MS,
  speed: SPEED.normal,
};

describe('Scheduler', () => {
  it('keeps Calm_State during a Pause when the Work_Interval shrinks below Work_Elapsed, then starts the Haunting at level 1 (12.7)', () => {
    let state = advance(initialState(), 15 * MINUTE_MS, config).state;
    state = reduce(state, { type: 'pause', durationMs: 30 * MINUTE_MS }, config).state;
    state = advance(state, 5 * MINUTE_MS, config).state;

    const shorter: SchedulerConfig = { ...config, workIntervalMs: 10 * MINUTE_MS };
    const changed = reduce(state, { type: 'configChanged', config: shorter }, shorter);
    expect(changed.events).toEqual([]);
    expect(derive(changed.state, shorter)).toMatchObject({
      phase: 'calm',
      level: 0,
      pause: { remainingMs: 25 * MINUTE_MS },
    });

    const duringPause = advance(changed.state, 24 * MINUTE_MS, shorter);
    expect(duringPause.events).toEqual([]);
    expect(derive(duringPause.state, shorter)).toMatchObject({ phase: 'calm', level: 0 });

    const afterPause = advance(duringPause.state, MINUTE_MS, shorter);
    expect(afterPause.events).toEqual([
      { type: 'pauseEnded' },
      { type: 'hauntingStarted', breakType: 'micro' },
    ]);
    expect(derive(afterPause.state, shorter)).toMatchObject({
      phase: 'haunting',
      level: 1,
      overdueMs: 0,
      overdueWholeMin: 0,
      breakType: 'micro',
    });
  });

  it('completes an early eye Ritual as a Micro_Break when configChanged lowers the frequency during the Ritual (26.1, 1.2, 1.4, 7.1)', () => {
    const wide: SchedulerConfig = { ...config, longBreakFrequency: 5 };
    // Two Hauntings, each ended by a Ritual_Exorcism, bring Break_Counter to 2.
    let state = initialState();
    for (let cycle = 0; cycle < 2; cycle++) {
      state = advance(state, config.workIntervalMs, wide).state;
      state = reduce(state, { type: 'ritualStarted', kind: 'eye', origin: 'haunting' }, wide).state;
      state = reduce(state, { type: 'ritualCompleted' }, wide).state;
    }
    expect(state.breakCounter).toBe(2);

    // An early Eye_Ritual at Break_Counter 2 with frequency 5 is taken as a Micro_Break.
    state = reduce(state, { type: 'ritualStarted', kind: 'eye', origin: 'early' }, wide).state;
    expect(state.ritual).toEqual({ kind: 'eye', origin: 'early', breakType: 'micro' });

    // Lowering the frequency to 2 clamps Break_Counter to 1, so the next break would now be a Long_Break.
    const narrow: SchedulerConfig = { ...config, longBreakFrequency: 2 };
    state = reduce(state, { type: 'configChanged', config: narrow }, narrow).state;
    expect(state.breakCounter).toBe(1);
    expect(derive(state, narrow)).toMatchObject({ phase: 'calm', ritual: 'eye', nextBreak: 'long' });

    // The Eye_Ritual still completes as the Micro_Break it started as.
    const done = reduce(state, { type: 'ritualCompleted' }, narrow);
    expect(done.events).toEqual([{ type: 'ritualExorcism', kind: 'eye', breakType: 'micro' }]);
    expect(done.state.breakCounter).toBe(1);
    expect(derive(done.state, narrow)).toMatchObject({ phase: 'calm', ritual: null, nextBreak: 'long' });
  });

  it('keeps the Escalation_Step of a running Haunting when configChanged changes it, and applies the new step from the next Haunting (3.3, 3.5)', () => {
    // Haunting starts at Escalation_Step 2 minutes; 5 minutes overdue is level 1 + 2 = 3.
    let state = advance(initialState(), config.workIntervalMs, config).state;
    state = advance(state, 5 * MINUTE_MS, config).state;
    expect(derive(state, config)).toMatchObject({
      phase: 'haunting',
      level: 3,
      escalationStepMs: 2 * MINUTE_MS,
    });

    // The setting moves to 5 minutes mid-Haunting. The level and the snapshot do not change.
    const slower: SchedulerConfig = { ...config, escalationStepMs: 5 * MINUTE_MS };
    const changed = reduce(state, { type: 'configChanged', config: slower }, slower);
    expect(changed.events).toEqual([]);
    expect(derive(changed.state, slower)).toMatchObject({
      phase: 'haunting',
      level: 3,
      overdueMs: 5 * MINUTE_MS,
      escalationStepMs: 2 * MINUTE_MS,
    });

    // After an Eye_Ritual ends this Haunting, the next Haunting starts with the 5-minute step:
    // 5 minutes overdue is then level 1 + 1 = 2.
    const ended = reduce(changed.state, { type: 'ritualStarted', kind: 'eye', origin: 'haunting' }, slower).state;
    const exorcised = reduce(ended, { type: 'ritualCompleted' }, slower).state;
    const next = advance(exorcised, slower.workIntervalMs, slower).state;
    const nextHaunting = advance(next, 5 * MINUTE_MS, slower).state;
    expect(derive(nextHaunting, slower)).toMatchObject({
      phase: 'haunting',
      level: 2,
      escalationStepMs: 5 * MINUTE_MS,
    });
  });
});
