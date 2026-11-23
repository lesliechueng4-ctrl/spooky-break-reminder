import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/core/rng';

function take(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives the same sequence for the same seed', () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('returns values in [0, 1)', () => {
    for (const seed of [0, 1, -1, 2 ** 31, 2 ** 32 + 5, Number.MAX_SAFE_INTEGER]) {
      for (const value of take(seed, 500)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('does not use Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    take(7, 100);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps integer bounds inclusive in nextInt', () => {
    const rng = createRng(99);
    const values = Array.from({ length: 500 }, () => rng.nextInt(0, 1));
    expect(new Set(values)).toEqual(new Set([0, 1]));
  });

  it('keeps nextInt inside the Whisper delay range of 20 000 to 40 000 ms', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 1_000; i += 1) {
      const delay = rng.nextInt(20_000, 40_000);
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(20_000);
      expect(delay).toBeLessThanOrEqual(40_000);
    }
  });

  it('returns the single value when nextInt bounds are equal', () => {
    expect(createRng(3).nextInt(7, 7)).toBe(7);
  });

  it('rejects a fractional or unsafe seed', () => {
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => createRng(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it('rejects invalid nextInt bounds', () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(5, 4)).toThrow(RangeError);
    expect(() => rng.nextInt(0.5, 4)).toThrow(RangeError);
  });
});
