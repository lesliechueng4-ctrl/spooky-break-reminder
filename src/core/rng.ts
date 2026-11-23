/**
 * Seeded pseudo-random generator for crack layouts and Whisper delays (design: HauntPhase.seed).
 *
 * The core never uses the platform random source. A given seed always produces the same
 * sequence, so a stored seed reproduces the same layout after a reload.
 */
export interface Rng {
  /** Next value in [0, 1). */
  next(): number;
  /** Next integer in [min, max], both bounds inclusive. */
  nextInt(min: number, max: number): number;
}

/** Creates a generator from an integer seed (mulberry32, 32-bit state). */
export function createRng(seed: number): Rng {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`seed must be a safe integer, got ${seed}`);
  }
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (min: number, max: number): number => {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError(`nextInt needs integer bounds with min <= max, got [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return { next, nextInt };
}
