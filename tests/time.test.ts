import { describe, expect, it } from 'vitest';
import {
  DEMO_NATURAL_BREAK_MS,
  GAP_TOLERANCE_MS,
  HEARTBEAT_MS,
  MINUTE_MS,
  SPEED,
  SUSPEND_EVIDENCE_MS,
  UNOBSERVED_GAP_LIMIT_MS,
  naturalBreakWallMs,
  scheduleDelta,
  toWholeMs,
} from '../src/core/time';

describe('time constants', () => {
  it('match the design values', () => {
    expect(SPEED).toEqual({ normal: 1, demo: 60 });
    expect(GAP_TOLERANCE_MS).toBe(45_000);
    expect(UNOBSERVED_GAP_LIMIT_MS).toBe(3_600_000);
    expect(SUSPEND_EVIDENCE_MS).toBe(30_000);
    expect(HEARTBEAT_MS).toBe(30_000);
    expect(MINUTE_MS).toBe(60_000);
  });

  it('keeps the gap tolerance below the smallest Natural_Break_Duration of 1 minute', () => {
    expect(GAP_TOLERANCE_MS).toBeLessThan(MINUTE_MS);
  });
});

describe('scheduleDelta', () => {
  it('adds the forward wall-clock step at normal speed', () => {
    expect(scheduleDelta(1_000, 4_500, SPEED.normal)).toBe(3_500);
  });

  it('multiplies the forward step by 60 in Demo_Mode', () => {
    expect(scheduleDelta(1_000, 4_500, SPEED.demo)).toBe(210_000);
  });

  it('adds zero for a backward clock step at either speed', () => {
    expect(scheduleDelta(10_000, 9_000, SPEED.normal)).toBe(0);
    expect(scheduleDelta(10_000, 9_000, SPEED.demo)).toBe(0);
  });

  it('adds zero when the clock did not move', () => {
    expect(scheduleDelta(10_000, 10_000, SPEED.demo)).toBe(0);
  });

  it('returns an integer for integer inputs', () => {
    const delta = scheduleDelta(0, 1_234_567, SPEED.demo);
    expect(Number.isInteger(delta)).toBe(true);
  });

  it('rejects fractional timestamps instead of letting them into the core', () => {
    expect(() => scheduleDelta(0.5, 1_000, SPEED.normal)).toThrow(RangeError);
    expect(() => scheduleDelta(0, 1_000.25, SPEED.normal)).toThrow(RangeError);
  });
});

describe('naturalBreakWallMs', () => {
  it('converts the configured minutes to milliseconds outside Demo_Mode', () => {
    expect(naturalBreakWallMs({ naturalBreakMin: 5 }, false)).toBe(300_000);
    expect(naturalBreakWallMs({ naturalBreakMin: 1 }, false)).toBe(60_000);
  });

  it('uses one wall-clock minute in Demo_Mode whatever the setting is', () => {
    expect(DEMO_NATURAL_BREAK_MS).toBe(60_000);
    expect(naturalBreakWallMs({ naturalBreakMin: 30 }, true)).toBe(60_000);
    expect(naturalBreakWallMs({ naturalBreakMin: 1 }, true)).toBe(60_000);
  });
});

describe('toWholeMs', () => {
  it('rounds to the nearest whole millisecond', () => {
    expect(toWholeMs(1_000.4)).toBe(1_000);
    expect(toWholeMs(1_000.6)).toBe(1_001);
  });
});
