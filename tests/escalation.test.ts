// Example tests for effectsFor and fogCoverage (Requirements 4.1-4.11, 11.2, 18.6, 19.3).
// The property tests for these rules are tasks 6.4-6.7 and live in their own files.
import { describe, expect, it } from 'vitest';
import {
  NO_FOG,
  effectsFor,
  fogAlpha,
  fogCoverage,
  type EffectContext,
} from '../src/core/escalation';
import {
  advance,
  derive,
  initialState,
  reduce,
  type SchedulerConfig,
  type ScheduleView,
} from '../src/core/scheduler';
import { MINUTE_MS, SPEED } from '../src/core/time';

const cfg: SchedulerConfig = {
  workIntervalMs: 20 * MINUTE_MS,
  longBreakFrequency: 3,
  escalationStepMs: 2 * MINUTE_MS,
  snoozeMs: 5 * MINUTE_MS,
  speed: SPEED.normal,
};
const STEP = cfg.escalationStepMs;

const ctx = (over: Partial<EffectContext> = {}): EffectContext => ({
  reducedMotion: false,
  ritualProgress: 0,
  escalationStepMs: STEP,
  ...over,
});

/** A Haunting view reached through the real Scheduler: `overdueMs` after the Due_Time. */
function hauntingAt(overdueMs: number): ScheduleView {
  const atDue = advance(initialState(), cfg.workIntervalMs, cfg).state;
  return derive(advance(atDue, overdueMs, cfg).state, cfg);
}

/** A Haunting view after `snoozes` completed Snoozes, with `overdueMs` more overdue time. */
function hauntingAfterSnoozes(snoozes: number, overdueMs: number): ScheduleView {
  let s = advance(initialState(), cfg.workIntervalMs, cfg).state;
  for (let i = 0; i < snoozes; i++) {
    s = reduce(s, { type: 'snooze' }, cfg).state;
    s = advance(s, cfg.snoozeMs, cfg).state;
  }
  return derive(advance(s, overdueMs, cfg).state, cfg);
}

describe('effectsFor in Calm_State', () => {
  it('shows a lit candle and no other effect', () => {
    const calm = derive(initialState(), cfg);
    expect(effectsFor(calm, ctx())).toEqual({
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
    });
  });
});

describe('effectsFor per Haunting_Level', () => {
  it('level 1: candle out, veil at 30%, a small ghost and no fog, cracks or Whispers (Requirement 4.1)', () => {
    const t = effectsFor(hauntingAt(0), ctx());
    expect(t.candleLit).toBe(false);
    expect(t.veil).toBeCloseTo(0.3, 10);
    expect(t.fogScale).toBe(NO_FOG);
    expect(t.fogOpacity).toBe(0);
    expect(t.ghostScale).toBeGreaterThan(0);
    expect(t.ghostOpacity).toBeGreaterThan(0);
    expect(t.cracks).toBe(0);
    expect(t.whisperGain).toBe(0);
    expect(t.possession).toBe(false);
  });

  it('level 2: fog starts at scale 1.65 and fog opacity is 1 (Requirement 4.2)', () => {
    const t = effectsFor(hauntingAt(STEP), ctx());
    expect(t.fogScale).toBeCloseTo(1.65, 10);
    expect(t.fogOpacity).toBe(1);
    expect(t.cracks).toBe(0);
  });

  it('level 3: cracks appear at the base of 3 and Whispers play at 40% of Master_Volume (Requirements 4.3, 18.6)', () => {
    const t = effectsFor(hauntingAt(2 * STEP), ctx());
    expect(t.cracks).toBe(3);
    expect(t.whisperGain).toBeCloseTo(0.4, 10);
    expect(t.ghostScale).toBeCloseTo(0.6, 10);
  });

  it('level 4: the ghost approaches within the level and Whispers play at 70% (Requirements 4.5, 18.6)', () => {
    const start = effectsFor(hauntingAt(3 * STEP), ctx());
    const later = effectsFor(hauntingAt(3 * STEP + STEP / 2), ctx());
    expect(start.ghostScale).toBeCloseTo(0.75, 10);
    expect(later.ghostScale).toBeGreaterThan(start.ghostScale);
    expect(start.cracks).toBe(5);
    expect(start.whisperGain).toBeCloseTo(0.7, 10);
    expect(start.possession).toBe(false);
  });

  it('level 5: Possession, veil at 70%, Whispers at full Master_Volume and fog at scale 1.0 (Requirements 4.7, 18.6)', () => {
    const t = effectsFor(hauntingAt(4 * STEP), ctx());
    expect(t.possession).toBe(true);
    expect(t.veil).toBeCloseTo(0.7, 10);
    expect(t.fogScale).toBeCloseTo(1, 10);
    expect(t.cracks).toBe(7);
    expect(t.whisperGain).toBe(1);
  });

  it('level 5 keeps the fog scale at 1.0 for any further overdue time', () => {
    expect(effectsFor(hauntingAt(9 * STEP), ctx()).fogScale).toBeCloseTo(1, 10);
  });
});

describe('fog scale falls with the Overdue_Duration', () => {
  it('moves from 1.65 at the start of level 2 toward 1.0 at the start of level 5', () => {
    const at = (o: number) => effectsFor(hauntingAt(o), ctx()).fogScale;
    expect(at(STEP)).toBeCloseTo(1.65, 10);
    expect(at(2 * STEP)).toBeLessThan(at(STEP));
    expect(at(3 * STEP)).toBeLessThan(at(2 * STEP));
    expect(at(4 * STEP)).toBeCloseTo(1, 10);
  });
});

describe('Snooze effects', () => {
  it('adds one crack per Snooze used in this Haunting (Requirement 4.9)', () => {
    // One Snooze of 5 minutes leaves the Haunting at level 3 (5 minutes overdue, step 2 minutes).
    const oneSnooze = effectsFor(hauntingAfterSnoozes(1, 0), ctx());
    expect(oneSnooze.cracks).toBe(4);
    // Two Snoozes give 10 minutes overdue, which is level 5 with base 7 and two extra cracks.
    expect(effectsFor(hauntingAfterSnoozes(2, 0), ctx()).cracks).toBe(9);
  });

  it('hides every effect while a Snooze is active and shows them again when it ends (Requirements 11.2, 11.7)', () => {
    let s = advance(initialState(), cfg.workIntervalMs, cfg).state;
    s = reduce(s, { type: 'snooze' }, cfg).state;
    s = advance(s, MINUTE_MS, cfg).state;
    expect(effectsFor(derive(s, cfg), ctx()).hidden).toBe(true);

    // The Snooze has 4 minutes left. When it ends, overdue is 5 minutes: level 3, veil 50%.
    s = advance(s, 4 * MINUTE_MS, cfg).state;
    const after = effectsFor(derive(s, cfg), ctx());
    expect(after.hidden).toBe(false);
    expect(after.veil).toBeCloseTo(0.5, 10);
  });

  it('computes the level from the full Overdue_Duration including snoozed time (Requirement 11.7)', () => {
    // Two Snoozes of 5 minutes each add 10 minutes of overdue time, so level 5 is reached.
    const t = effectsFor(hauntingAfterSnoozes(2, 0), ctx());
    expect(t.possession).toBe(true);
  });
});

describe('Ritual progress', () => {
  it('scales the intensity channels by (1 - progress) and leaves cracks and the candle unchanged (Requirement 4.11)', () => {
    const view = hauntingAfterSnoozes(1, 4 * STEP);
    const none = effectsFor(view, ctx());
    const half = effectsFor(view, ctx({ ritualProgress: 0.5 }));
    expect(half.veil).toBeCloseTo(none.veil * 0.5, 10);
    expect(half.fogOpacity).toBeCloseTo(none.fogOpacity * 0.5, 10);
    expect(half.ghostOpacity).toBeCloseTo(none.ghostOpacity * 0.5, 10);
    expect(half.whisperGain).toBeCloseTo(none.whisperGain * 0.5, 10);
    expect(half.cracks).toBe(none.cracks);
    expect(half.candleLit).toBe(none.candleLit);
    expect(half.fogScale).toBe(none.fogScale);
    expect(half.ghostScale).toBe(none.ghostScale);
  });

  it('removes the intensity channels at full progress', () => {
    const t = effectsFor(hauntingAt(4 * STEP), ctx({ ritualProgress: 1 }));
    expect(t.veil).toBe(0);
    expect(t.fogOpacity).toBe(0);
    expect(t.ghostOpacity).toBe(0);
    expect(t.whisperGain).toBe(0);
    expect(t.cracks).toBe(7);
  });
});

describe('Reduced_Motion', () => {
  it('uses one static ghost scale per level, whatever the Overdue_Duration (Requirement 19.3)', () => {
    const rm = ctx({ reducedMotion: true });
    expect(effectsFor(hauntingAt(3 * STEP), rm).ghostScale).toBeCloseTo(0.75, 10);
    expect(effectsFor(hauntingAt(3 * STEP + STEP / 2), rm).ghostScale).toBeCloseTo(0.75, 10);
  });

  it('uses one static fog scale per level, taken at the start of that level', () => {
    const rm = ctx({ reducedMotion: true });
    expect(effectsFor(hauntingAt(STEP), rm).fogScale).toBeCloseTo(1.65, 10);
    expect(effectsFor(hauntingAt(2 * STEP), rm).fogScale).toBeCloseTo(1.65 - 0.65 / 3, 10);
    expect(effectsFor(hauntingAt(4 * STEP), rm).fogScale).toBeCloseTo(1, 10);
  });
});

describe('effectsFor input validation', () => {
  it('rejects a ritual progress outside [0, 1]', () => {
    expect(() => effectsFor(hauntingAt(0), ctx({ ritualProgress: 1.5 }))).toThrow(RangeError);
    expect(() => effectsFor(hauntingAt(0), ctx({ ritualProgress: -0.1 }))).toThrow(RangeError);
  });

  it('rejects a non-positive or non-integer Escalation_Step', () => {
    expect(() => effectsFor(hauntingAt(0), ctx({ escalationStepMs: 0 }))).toThrow(RangeError);
    expect(() => effectsFor(hauntingAt(0), ctx({ escalationStepMs: 1.5 }))).toThrow(RangeError);
  });
});

describe('fogAlpha', () => {
  it('is 0 at the centre, 0.5 at r = 0.6 and 1 at the edge of the vignette', () => {
    expect(fogAlpha(0, 0)).toBe(0);
    expect(fogAlpha(0.6, 0)).toBeCloseTo(0.5, 10);
    expect(fogAlpha(1, 0)).toBe(1);
    expect(fogAlpha(0, 1)).toBe(1);
  });
});

describe('fogCoverage', () => {
  it('is about 0.67 at scale 1.0, which covers the 60% Possession threshold by itself (Requirement 4.7)', () => {
    const c = fogCoverage(1);
    expect(c).toBeGreaterThan(0.65);
    expect(c).toBeLessThan(0.68);
  });

  it('is a thin band of about 0.09 at scale 1.65, the start of level 2', () => {
    const c = fogCoverage(1.65);
    expect(c).toBeGreaterThan(0.05);
    expect(c).toBeLessThan(0.15);
  });

  it('is 0 for no fog, and it never increases as the scale grows', () => {
    expect(fogCoverage(NO_FOG)).toBe(0);
    const scales = [1, 1.1, 1.3, 1.5, 1.65];
    const coverage = scales.map((s) => fogCoverage(s));
    for (let i = 1; i < coverage.length; i++) {
      expect(coverage[i]).toBeLessThanOrEqual(coverage[i - 1]);
    }
  });

  it('rejects a zero or negative scale', () => {
    expect(() => fogCoverage(0)).toThrow(RangeError);
    expect(() => fogCoverage(-1)).toThrow(RangeError);
    expect(() => fogCoverage(Number.NaN)).toThrow(RangeError);
  });
});
