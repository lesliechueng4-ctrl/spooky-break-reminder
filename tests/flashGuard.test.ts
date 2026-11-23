// Example tests for the Flash_Guard (Requirements 19.4, 6.8). The property test for the Flash
// limit is task 6.9 and lives in its own file.
import { describe, expect, it } from 'vitest';
import {
  FLASH_WINDOW_MS,
  JUMP_SCARE_FADE_MS,
  JUMP_SCARE_HOLD_MS,
  JUMP_SCARE_RISE_MS,
  JUMP_SCARE_TOTAL_MS,
  MAX_FLASHES_PER_WINDOW,
  MIN_REVERSAL_INTERVAL_MS,
  countFlashes,
  guardTarget,
  initialGuardState,
} from '../src/core/flashGuard';

type Sample = { t: number; lum: number };

/**
 * Builds a trace whose direction reverses exactly at each time in `reversalTimes`. The first
 * change sets the direction without counting, so the trace starts with a warm-up step.
 */
function traceWithReversalsAt(reversalTimes: number[]): Sample[] {
  const trace: Sample[] = [
    { t: -2, lum: 0 },
    { t: -1, lum: 1 },
  ];
  reversalTimes.forEach((t, k) => {
    trace.push({ t, lum: k % 2 === 0 ? 0 : 1 });
  });
  return trace;
}

describe('Jump_Scare timeline constants', () => {
  it('uses rise 60 ms, hold 1 200 ms and fade 300 ms, 1 560 ms in total (Requirement 6.8)', () => {
    expect(JUMP_SCARE_RISE_MS).toBe(60);
    expect(JUMP_SCARE_HOLD_MS).toBe(1_200);
    expect(JUMP_SCARE_FADE_MS).toBe(300);
    expect(JUMP_SCARE_TOTAL_MS).toBe(1_560);
    expect(JUMP_SCARE_TOTAL_MS).toBeLessThanOrEqual(2_000);
  });

  it('keeps the flash window at 1 second with at most 3 Flashes (Requirement 19.4)', () => {
    expect(FLASH_WINDOW_MS).toBe(1_000);
    expect(MAX_FLASHES_PER_WINDOW).toBe(3);
    expect(MIN_REVERSAL_INTERVAL_MS).toBe(500);
  });
});

describe('initialGuardState', () => {
  it('starts with no direction and no reversal', () => {
    expect(initialGuardState(0.25)).toEqual({ lum: 0.25, dir: 0, reversedAtMs: null });
  });

  it('rejects a non-finite luminance', () => {
    expect(() => initialGuardState(Number.NaN)).toThrow(RangeError);
  });
});

describe('guardTarget', () => {
  it('commits a change in the same direction at once without recording a reversal', () => {
    const s0 = initialGuardState(0.2);
    const s1 = guardTarget(s0, 0.5, 0);
    const s2 = guardTarget(s1, 0.8, 10);
    expect(s1).toEqual({ lum: 0.5, dir: 1, reversedAtMs: null });
    expect(s2).toEqual({ lum: 0.8, dir: 1, reversedAtMs: null });
  });

  it('commits the first reversal at once when no earlier reversal exists', () => {
    const up = guardTarget(initialGuardState(0.2), 0.5, 0);
    const down = guardTarget(up, 0.1, 1);
    expect(down).toEqual({ lum: 0.1, dir: -1, reversedAtMs: 1 });
  });

  it('defers a reversal that comes less than 500 ms after the previous reversal', () => {
    const up = guardTarget(initialGuardState(0.2), 0.5, 0);
    const down = guardTarget(up, 0.1, 1_000);
    const deferredUp = guardTarget(down, 0.5, 1_400);
    expect(deferredUp).toBe(down);
    expect(deferredUp.lum).toBe(0.1);
    expect(deferredUp.dir).toBe(-1);
    expect(deferredUp.reversedAtMs).toBe(1_000);
  });

  it('commits a deferred reversal once 500 ms have passed, including at exactly 500 ms', () => {
    const down = guardTarget(guardTarget(initialGuardState(0.2), 0.5, 0), 0.1, 1_000);
    expect(guardTarget(down, 0.5, 1_499).lum).toBe(0.1);
    const committed = guardTarget(down, 0.5, 1_500);
    expect(committed).toEqual({ lum: 0.5, dir: 1, reversedAtMs: 1_500 });
  });

  it('commits a same-direction change during a deferral without treating it as a reversal', () => {
    const down = guardTarget(guardTarget(initialGuardState(0.2), 0.5, 0), 0.1, 1_000);
    const deferredUp = guardTarget(down, 0.5, 1_100);
    expect(deferredUp.lum).toBe(0.1);
    const furtherDown = guardTarget(deferredUp, 0.05, 1_150);
    expect(furtherDown).toEqual({ lum: 0.05, dir: -1, reversedAtMs: 1_000 });
  });

  it('returns the same state when the target equals the shown value', () => {
    const state = guardTarget(initialGuardState(0.2), 0.5, 0);
    expect(guardTarget(state, 0.5, 100)).toBe(state);
  });

  it('defers a Jump_Scare rise that reverses too soon after a previous reversal', () => {
    // A fade down at 0 ms is a reversal. The next rise at 300 ms falls inside the interval.
    const start = guardTarget(guardTarget(initialGuardState(0), 1, 0), 0, 0);
    expect(start.reversedAtMs).toBe(0);
    const scareRise = guardTarget(start, 1, 300);
    expect(scareRise.lum).toBe(0);
    expect(guardTarget(start, 1, 500).lum).toBe(1);
  });

  it('rejects non-finite targets and times', () => {
    const state = initialGuardState(0);
    expect(() => guardTarget(state, Number.NaN, 0)).toThrow(RangeError);
    expect(() => guardTarget(state, 1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('countFlashes', () => {
  it('returns 0 for an empty trace and for a single sample', () => {
    expect(countFlashes([], FLASH_WINDOW_MS)).toBe(0);
    expect(countFlashes([{ t: 0, lum: 0 }], FLASH_WINDOW_MS)).toBe(0);
  });

  it('returns 0 for a monotone trace', () => {
    const trace = [
      { t: 0, lum: 0 },
      { t: 100, lum: 0.2 },
      { t: 200, lum: 0.5 },
      { t: 300, lum: 0.9 },
    ];
    expect(countFlashes(trace, FLASH_WINDOW_MS)).toBe(0);
  });

  it('counts one Flash per reversal and ignores flat samples between opposing changes', () => {
    const trace = [
      { t: 0, lum: 0 },
      { t: 10, lum: 1 },
      { t: 20, lum: 1 },
      { t: 30, lum: 0 },
    ];
    expect(countFlashes(trace, FLASH_WINDOW_MS)).toBe(1);
  });

  it('counts two reversals 500 ms apart as two Flashes in one window', () => {
    expect(countFlashes(traceWithReversalsAt([0, 500]), FLASH_WINDOW_MS)).toBe(2);
  });

  it('uses a half-open window: reversals 1 000 ms apart are never in the same window', () => {
    expect(countFlashes(traceWithReversalsAt([0, 999]), FLASH_WINDOW_MS)).toBe(2);
    expect(countFlashes(traceWithReversalsAt([0, 1_000]), FLASH_WINDOW_MS)).toBe(1);
  });

  it('returns the largest count over all sliding windows', () => {
    // Window [0, 1000) holds 0, 400 and 800. The fourth reversal starts a later window.
    expect(countFlashes(traceWithReversalsAt([0, 400, 800, 1_200]), FLASH_WINDOW_MS)).toBe(3);
  });
});

describe('guard output through countFlashes', () => {
  it('limits a target that flips every 50 ms to at most 2 Flashes per second', () => {
    let state = initialGuardState(0);
    const raw: Sample[] = [];
    const guarded: Sample[] = [];
    for (let t = 0; t <= 10_000; t += 16) {
      const target = Math.floor(t / 50) % 2;
      state = guardTarget(state, target, t);
      raw.push({ t, lum: target });
      guarded.push({ t, lum: state.lum });
    }
    expect(countFlashes(raw, FLASH_WINDOW_MS)).toBeGreaterThan(MAX_FLASHES_PER_WINDOW);
    expect(countFlashes(guarded, FLASH_WINDOW_MS)).toBeLessThanOrEqual(2);
  });
});
