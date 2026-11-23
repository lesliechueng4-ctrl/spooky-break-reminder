// Unit tests for the synthesized sounds (src/platform/audio/synth.ts). They check the sample
// shape, the peak levels, the cue pitch and the seeded determinism of the Whisper noise.
// Requirements: 6.8 (scream length), 8.5 (chime), 9.3 (cue tones), 18.4 (peaks within the cap), 31.8.
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { JUMP_SCARE_TOTAL_MS } from '../src/core/flashGuard';
import {
  CHIME_SECONDS,
  CUE_SECONDS,
  WHISPER_SECONDS,
  cueFrequencyHz,
  renderChime,
  renderCue,
  renderScream,
  renderWhisper,
} from '../src/platform/audio/synth';

const RATE = 48_000;

function peak(samples: Float32Array): number {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  return max;
}

function expectFiniteWithinUnitRange(samples: Float32Array): void {
  for (const s of samples) {
    expect(Number.isFinite(s)).toBe(true);
    expect(Math.abs(s)).toBeLessThanOrEqual(1);
  }
}

/** Estimates the frequency of a tone from its zero crossings in a window, in Hz. */
function frequencyBetween(samples: Float32Array, fromSec: number, toSec: number): number {
  let crossings = 0;
  const from = Math.round(fromSec * RATE);
  const to = Math.round(toSec * RATE);
  for (let i = from + 1; i < to; i += 1) {
    if (Math.sign(samples[i]) !== Math.sign(samples[i - 1])) crossings += 1;
  }
  return crossings / 2 / (toSec - fromSec);
}

describe('renderWhisper', () => {
  it('returns about 3.5 s of finite samples with a peak of 0.8 (Requirement 18.4)', () => {
    const samples = renderWhisper(RATE, createRng(1));
    expect(samples).toBeInstanceOf(Float32Array);
    expect(samples.length).toBe(Math.round(WHISPER_SECONDS * RATE));
    expectFiniteWithinUnitRange(samples);
    expect(peak(samples)).toBeCloseTo(0.8, 5);
  });

  it('fades in and out so the buffer starts and ends at silence', () => {
    const samples = renderWhisper(RATE, createRng(2));
    expect(Math.abs(samples[0])).toBeLessThan(1e-6);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
  });

  it('gives the same samples for the same seed and different samples for another seed', () => {
    const a = renderWhisper(RATE, createRng(7));
    const b = renderWhisper(RATE, createRng(7));
    const c = renderWhisper(RATE, createRng(8));
    expect(Array.from(a.slice(0, 2_000))).toEqual(Array.from(b.slice(0, 2_000)));
    expect(Array.from(a.slice(0, 2_000))).not.toEqual(Array.from(c.slice(0, 2_000)));
  });

  it('rejects a sample rate that is not a positive number', () => {
    expect(() => renderWhisper(0, createRng(1))).toThrow(RangeError);
    expect(() => renderWhisper(Number.NaN, createRng(1))).toThrow(RangeError);
  });
});

describe('renderChime', () => {
  it('returns about 4 s of finite samples with a peak of 0.6', () => {
    const samples = renderChime(RATE);
    expect(samples.length).toBe(Math.round(CHIME_SECONDS * RATE));
    expectFiniteWithinUnitRange(samples);
    expect(peak(samples)).toBeCloseTo(0.6, 5);
  });
});

describe('renderCue', () => {
  it('uses a tone that is higher for the inhale than for the exhale', () => {
    expect(cueFrequencyHz('inhale')).toBeGreaterThan(cueFrequencyHz('exhale'));
  });

  it('plays the tone at its frequency, with a peak of 0.5 and a length of 3 s', () => {
    const inhale = renderCue(RATE, 'inhale');
    expect(inhale.length).toBe(Math.round(CUE_SECONDS * RATE));
    expectFiniteWithinUnitRange(inhale);
    expect(peak(inhale)).toBeCloseTo(0.5, 5);
    expect(frequencyBetween(inhale, 0.1, 1.1)).toBeCloseTo(cueFrequencyHz('inhale'), -1);

    const exhale = renderCue(RATE, 'exhale');
    expect(frequencyBetween(exhale, 0.1, 1.1)).toBeCloseTo(cueFrequencyHz('exhale'), -1);
  });
});

describe('renderScream', () => {
  it('lasts exactly the Jump_Scare timeline of 1 560 ms with a peak of 0.9 (Requirement 6.8)', () => {
    const samples = renderScream(RATE, createRng(3));
    expect(JUMP_SCARE_TOTAL_MS).toBe(1_560);
    expect(samples.length).toBe(Math.round((JUMP_SCARE_TOTAL_MS / 1000) * RATE));
    expectFiniteWithinUnitRange(samples);
    expect(peak(samples)).toBeCloseTo(0.9, 5);
  });

  it('ends at silence after its fade', () => {
    const samples = renderScream(RATE, createRng(4));
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
  });
});
