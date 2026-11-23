import { afterEach, describe, expect, it, vi } from 'vitest';
import { crackPathD, generateCracks } from '../src/effects/cracks';

describe('generateCracks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns n cracks, and no cracks for n = 0', () => {
    expect(generateCracks(5, 0)).toEqual([]);
    expect(generateCracks(5, 4)).toHaveLength(4);
  });

  it('gives the same layout for the same seed', () => {
    expect(generateCracks(42, 6)).toEqual(generateCracks(42, 6));
  });

  it('gives different layouts for different seeds', () => {
    expect(generateCracks(1, 5)).not.toEqual(generateCracks(2, 5));
  });

  it('keeps the earlier cracks unchanged when another crack is added', () => {
    const three = generateCracks(77, 3);
    const five = generateCracks(77, 5);
    expect(five.slice(0, 3)).toEqual(three);
  });

  it('starts each crack on an edge of the viewport and keeps every point inside it', () => {
    for (const crack of generateCracks(9, 20)) {
      const first = crack[0]!;
      const onEdge = first.x1 === 0 || first.x1 === 1 || first.y1 === 0 || first.y1 === 1;
      expect(onEdge).toBe(true);
      for (const s of crack) {
        for (const v of [s.x1, s.y1, s.x2, s.y2]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('grows branches from the trunk, never deeper than depth 2', () => {
    const depths = generateCracks(7, 30).flatMap((crack) => crack.map((s) => s.depth));
    expect(Math.min(...depths)).toBe(0);
    expect(Math.max(...depths)).toBeGreaterThan(0);
    expect(Math.max(...depths)).toBeLessThanOrEqual(2);
  });

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    generateCracks(3, 5);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-integer seed and a negative or fractional count', () => {
    expect(() => generateCracks(1.5, 2)).toThrow(RangeError);
    expect(() => generateCracks(1, -1)).toThrow(RangeError);
    expect(() => generateCracks(1, 2.5)).toThrow(RangeError);
  });
});

describe('crackPathD', () => {
  it('writes one move and one line for each segment', () => {
    const [crack] = generateCracks(12, 1);
    const d = crackPathD(crack!);
    expect(d.startsWith('M')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(crack!.length);
    expect(d.match(/L/g)).toHaveLength(crack!.length);
  });

  it('returns an empty path for a crack with no segments', () => {
    expect(crackPathD([])).toBe('');
  });
});
