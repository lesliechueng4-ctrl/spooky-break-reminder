// Tab title and favicon examples (Requirements 2.2, 16.1-16.5). The views come from the real
// Scheduler, so the expected strings follow the schedule rules rather than hand-built values.
import { describe, expect, it } from 'vitest';
import { derive, initialState, reduce, type SchedulerConfig } from '../src/core/scheduler';
import { MINUTE_MS, SPEED } from '../src/core/time';
import { formatClock, tabStatus } from '../src/core/tabStatus';

const cfg: SchedulerConfig = {
  workIntervalMs: 20 * MINUTE_MS,
  longBreakFrequency: 3,
  escalationStepMs: 2 * MINUTE_MS,
  snoozeMs: 5 * MINUTE_MS,
  speed: SPEED.normal,
};

function calmAfter(elapsedMs: number) {
  return derive(reduce(initialState(), { type: 'advance', dt: elapsedMs }, cfg).state, cfg);
}

function hauntedFor(overdueMs: number) {
  const { state } = reduce(initialState(), { type: 'advance', dt: cfg.workIntervalMs + overdueMs }, cfg);
  return derive(state, cfg);
}

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [1, '00:01'],
    [999, '00:01'],
    [1_000, '00:01'],
    [1_001, '00:02'],
    [59_999, '01:00'],
    [20 * MINUTE_MS, '20:00'],
    [60 * MINUTE_MS, '60:00'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatClock(ms)).toBe(expected);
  });

  it('treats a negative time as zero', () => {
    expect(formatClock(-5_000)).toBe('00:00');
  });
});

describe('tabStatus in Calm_State', () => {
  it('shows the full Work_Interval as whole minutes with the candle favicon', () => {
    expect(tabStatus(calmAfter(0), 'en')).toEqual({ title: '20 min - Spooky Break', favicon: 'candle' });
  });

  it('rounds the remaining minutes up, so 1 ms less than 20 minutes still shows 20', () => {
    expect(tabStatus(calmAfter(1), 'en').title).toBe('20 min - Spooky Break');
  });

  it('rounds up at a whole-minute boundary that is not exact', () => {
    expect(tabStatus(calmAfter(2 * MINUTE_MS + 30_000), 'en').title).toBe('18 min - Spooky Break');
  });

  it('shows Paused in the title during a Pause', () => {
    const { state } = reduce(initialState(), { type: 'pause', durationMs: 30 * MINUTE_MS }, cfg);
    expect(tabStatus(derive(state, cfg), 'en')).toEqual({
      title: 'Paused: 20 min - Spooky Break',
      favicon: 'candle',
    });
  });
});

describe('tabStatus during a Haunting', () => {
  it('shows Level 1 and 0 minutes overdue at the Due_Time', () => {
    expect(tabStatus(hauntedFor(0), 'en')).toEqual({
      title: 'Level 1 - 0 min overdue',
      favicon: 'level-1',
    });
  });

  it('shows the level and the overdue minutes rounded down', () => {
    // 4 min 59 s overdue with a 2 min Escalation_Step is Level 3 (1 + 2 whole steps).
    expect(tabStatus(hauntedFor(4 * MINUTE_MS + 59_000), 'en')).toEqual({
      title: 'Level 3 - 4 min overdue',
      favicon: 'level-3',
    });
  });

  it('caps the level at 5 and uses the matching favicon', () => {
    expect(tabStatus(hauntedFor(10 * MINUTE_MS), 'en')).toEqual({
      title: 'Level 5 - 10 min overdue',
      favicon: 'level-5',
    });
  });

  it('adds the Snoozed indicator during a Snooze and keeps the level favicon', () => {
    const haunted = reduce(initialState(), { type: 'advance', dt: cfg.workIntervalMs + 4 * MINUTE_MS }, cfg);
    const snoozed = reduce(haunted.state, { type: 'snooze' }, cfg).state;
    expect(tabStatus(derive(snoozed, cfg), 'en')).toEqual({
      title: 'Snoozed: Level 3 - 4 min overdue',
      favicon: 'level-3',
    });
  });
});

describe('tabStatus in Chinese', () => {
  it('uses the Chinese messages for Calm and Haunting', () => {
    expect(tabStatus(calmAfter(0), 'zh-CN').title).toBe('20 分钟 - 诡异休息提醒');
    expect(tabStatus(hauntedFor(4 * MINUTE_MS), 'zh-CN')).toEqual({
      title: '等级 3 - 逾期 4 分钟',
      favicon: 'level-3',
    });
  });
});
