// **Feature: spooky-break-reminder, Property 10: Clock steps and Demo_Mode scaling**
// **Validates: Requirements 1.6, 14.7, 25.3, 29.5**
//
// For any sequence of wall-clock readings, including backward steps, the total schedule time added
// equals the sum of the positive differences between consecutive readings multiplied by the speed
// (1, or 60 in Demo_Mode); every backward step adds zero.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SPEED, scheduleDelta } from '../src/core/time';

const MAX_STEP_MS = 10_000_000; // about 2.8 hours in one step

/** A wall-clock reading in epoch milliseconds, as Date.now() reports it. */
const arbStart = fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 });

/**
 * One wall-clock step in milliseconds, negative for a backward clock step. Biased toward the
 * boundaries of the schedule: no movement, one millisecond either way, the Gap_Tolerance, one
 * minute, one day, and small jitter around zero. Random large steps keep the space wide.
 */
const arbStep: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -MAX_STEP_MS, max: MAX_STEP_MS }),
  fc.constantFrom(0, 1, -1, 45_000, -45_000, 60_000, -60_000, 86_400_000, -86_400_000),
  fc.integer({ min: -5, max: 5 }),
);

/** A start reading followed by steps; `readings` is the running wall clock after each step. */
const arbReadings: fc.Arbitrary<number[]> = fc
  .tuple(arbStart, fc.array(arbStep, { minLength: 0, maxLength: 60 }))
  .map(([start, steps]) => {
    const readings = [start];
    for (const step of steps) readings.push(readings[readings.length - 1] + step);
    return readings;
  });

/** Oracle: the sum of the positive differences between consecutive readings, in milliseconds. */
function sumOfPositiveSteps(readings: readonly number[]): number {
  let sum = 0;
  for (let i = 1; i < readings.length; i += 1) {
    const diff = readings[i] - readings[i - 1];
    if (diff > 0) sum += diff;
  }
  return sum;
}

/** Schedule time added across all readings, using the real core function at the given speed. */
function totalScheduleTime(readings: readonly number[], speed: 1 | 60): number {
  let total = 0;
  for (let i = 1; i < readings.length; i += 1) {
    total += scheduleDelta(readings[i - 1], readings[i], speed);
  }
  return total;
}

describe('Property 10: Clock steps and Demo_Mode scaling', () => {
  it('adds the positive wall-clock steps times the speed, adds zero for backward steps, and scales by 60 in Demo_Mode', () => {
    fc.assert(
      fc.property(arbReadings, (readings) => {
        const expectedNormal = sumOfPositiveSteps(readings);

        // Total schedule time equals the sum of positive steps at 1x (Requirement 1.6, 14.7).
        expect(totalScheduleTime(readings, SPEED.normal)).toBe(expectedNormal);

        // Demo_Mode scales every positive step by 60 and adds nothing for backward steps (Requirement 25.3).
        expect(totalScheduleTime(readings, SPEED.demo)).toBe(expectedNormal * SPEED.demo);

        // Every backward step adds zero at both speeds, and every forward step adds its scaled length.
        for (let i = 1; i < readings.length; i += 1) {
          const prev = readings[i - 1];
          const next = readings[i];
          const normal = scheduleDelta(prev, next, SPEED.normal);
          const demo = scheduleDelta(prev, next, SPEED.demo);
          if (next < prev) {
            expect(normal).toBe(0);
            expect(demo).toBe(0);
          } else {
            expect(normal).toBe(next - prev);
            expect(demo).toBe((next - prev) * SPEED.demo);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
