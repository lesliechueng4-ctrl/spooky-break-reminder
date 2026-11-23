/**
 * Team-made sounds, synthesized sample by sample (design: "Platform Adapters", audio/synth.ts;
 * Requirements 8.5, 9.3, 6.8, 31.8). No audio file is loaded.
 *
 * Every function returns mono Float32 samples at the sample rate it is given. The functions do
 * not touch the Web Audio API, so the Audio_Engine decides where the samples play and when.
 * Gain envelopes are not applied here: the engine ramps each voice from silence over its attack
 * (audioPolicy.attackMsFor), so the buffers only hold the sound's own shape.
 *
 * The only randomness comes from the seeded Rng passed to renderWhisper (tech steering).
 */
import { JUMP_SCARE_TOTAL_MS } from '../../core/flashGuard';
import type { Rng } from '../../core/rng';

export const WHISPER_SECONDS = 3.5;
export const CHIME_SECONDS = 4;
/**
 * A cue outlasts the 2.5 s voice attack, so it reaches its target gain before it ends. A shorter
 * cue would stop while still silent (Requirement 5.4).
 */
export const CUE_SECONDS = 3;
export const SCREAM_SECONDS = JUMP_SCARE_TOTAL_MS / 1000;

/** The breathing phases that have a cue tone (Requirement 9.3). */
export type CuePhase = 'inhale' | 'exhale';

const TWO_PI = 2 * Math.PI;
const WHISPER_PEAK = 0.8;
const CHIME_PEAK = 0.6;
const CUE_PEAK = 0.5;
const SCREAM_PEAK = 0.9;

/** Tone of each breathing cue. The inhale rises a fourth above the exhale. */
const CUE_FREQUENCY_HZ: Record<CuePhase, number> = {
  inhale: 392, // G4
  exhale: 293.66, // D4
};

export function cueFrequencyHz(phase: CuePhase): number {
  return CUE_FREQUENCY_HZ[phase];
}

/**
 * Whisper: pink noise through three band-pass "formant" filters, shaped by a three-syllable
 * envelope and a short multi-tap tail that stands in for a room reverb.
 */
export function renderWhisper(sampleRate: number, rng: Rng): Float32Array {
  const length = samplesFor(WHISPER_SECONDS, sampleRate);
  const noise = pinkNoise(length, rng);

  const formants: ReadonlyArray<{ hz: number; q: number; weight: number }> = [
    { hz: 500, q: 6, weight: 1 },
    { hz: 1500, q: 8, weight: 0.6 },
    { hz: 2500, q: 10, weight: 0.35 },
  ];
  const voiced = new Float32Array(length);
  for (const { hz, q, weight } of formants) {
    const band = bandPass(noise, sampleRate, hz, q);
    for (let i = 0; i < length; i += 1) voiced[i] += weight * band[i];
  }

  const syllableCentres = [0.5, 1.5, 2.5];
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    voiced[i] *= syllableEnvelope(t, syllableCentres) * edgeFade(t, WHISPER_SECONDS, 0.05, 0.4);
  }

  const reverbed = addTaps(voiced, sampleRate, [
    { delaySec: 0.029, gain: 0.35 },
    { delaySec: 0.047, gain: 0.25 },
    { delaySec: 0.071, gain: 0.15 },
  ]);
  return normalizePeak(reverbed, WHISPER_PEAK);
}

/** Completion chime for a finished Eye_Ritual: three decaying sine partials (Requirement 8.5). */
export function renderChime(sampleRate: number): Float32Array {
  const partials: ReadonlyArray<{ hz: number; amp: number; decaySec: number }> = [
    { hz: 523.25, amp: 1, decaySec: 1.6 },
    { hz: 659.25, amp: 0.6, decaySec: 1.4 },
    { hz: 783.99, amp: 0.4, decaySec: 1.2 },
  ];
  const length = samplesFor(CHIME_SECONDS, sampleRate);
  const out = new Float32Array(length);
  for (const { hz, amp, decaySec } of partials) {
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      out[i] += amp * Math.sin(TWO_PI * hz * t) * Math.exp(-t / decaySec);
    }
  }
  return normalizePeak(out, CHIME_PEAK);
}

/** Breathing cue tone for one phase change (Requirement 9.3). */
export function renderCue(sampleRate: number, phase: CuePhase): Float32Array {
  const hz = cueFrequencyHz(phase);
  const length = samplesFor(CUE_SECONDS, sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    out[i] = Math.sin(TWO_PI * hz * t) * edgeFade(t, CUE_SECONDS, 0.01, 0.5);
  }
  return normalizePeak(out, CUE_PEAK);
}

/**
 * Jump_Scare scream: two sawtooth voices detuned by 15 cents, with a pitch sweep from 180 Hz to
 * 720 Hz, vibrato after the sweep and a breath of noise. It lasts as long as the Jump_Scare
 * timeline (1 560 ms, Requirement 6.8) and fades out over its last 300 ms.
 */
export function renderScream(sampleRate: number, rng: Rng): Float32Array {
  const length = samplesFor(SCREAM_SECONDS, sampleRate);
  const out = new Float32Array(length);
  const detune = Math.pow(2, 15 / 1200);
  let phaseA = 0;
  let phaseB = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const sweep = Math.min(1, t / 0.3);
    const vibrato = t > 0.3 ? 1 + 0.02 * Math.sin(TWO_PI * 5.5 * t) : 1;
    const hz = (180 + 540 * sweep) * vibrato;
    phaseA += hz / sampleRate;
    phaseB += (hz * detune) / sampleRate;
    const sawA = 2 * (phaseA - Math.floor(phaseA)) - 1;
    const sawB = 2 * (phaseB - Math.floor(phaseB)) - 1;
    const breath = 0.15 * (rng.next() * 2 - 1);
    out[i] = (0.5 * sawA + 0.5 * sawB + breath) * edgeFade(t, SCREAM_SECONDS, 0, 0.3);
  }
  return normalizePeak(out, SCREAM_PEAK);
}

function samplesFor(seconds: number, sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`sampleRate must be a positive number, got ${String(sampleRate)}`);
  }
  return Math.round(seconds * sampleRate);
}

/** Paul Kellet's economy pink-noise filter over the seeded generator. */
function pinkNoise(length: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = rng.next() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return out;
}

/** RBJ band-pass filter (constant 0 dB peak gain), applied in Direct Form I. */
function bandPass(input: Float32Array, sampleRate: number, hz: number, q: number): Float32Array {
  const w0 = (TWO_PI * hz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;

  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** Sum of raised-cosine bumps, one per syllable, capped at 1. */
function syllableEnvelope(t: number, centres: readonly number[]): number {
  const halfWidth = 0.45;
  let sum = 0;
  for (const c of centres) {
    const d = Math.abs(t - c);
    if (d < halfWidth) sum += 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth));
  }
  return Math.min(1, sum);
}

/** Linear fade in over `fadeInSec` and out over `fadeOutSec` at the end of a `totalSec` sound. */
function edgeFade(t: number, totalSec: number, fadeInSec: number, fadeOutSec: number): number {
  const inGain = fadeInSec > 0 ? Math.min(1, t / fadeInSec) : 1;
  const outGain = fadeOutSec > 0 ? Math.min(1, Math.max(0, (totalSec - t) / fadeOutSec)) : 1;
  return inGain * outGain;
}

/** Adds delayed, scaled copies of the signal. Each tap reads the dry signal, so the tail does not feed back. */
function addTaps(
  dry: Float32Array,
  sampleRate: number,
  taps: ReadonlyArray<{ delaySec: number; gain: number }>,
): Float32Array {
  const out = Float32Array.from(dry);
  for (const { delaySec, gain } of taps) {
    const offset = Math.round(delaySec * sampleRate);
    for (let i = offset; i < dry.length; i += 1) out[i] += gain * dry[i - offset];
  }
  return out;
}

/** Scales the samples so the largest absolute value equals `peak`. Silent input stays silent. */
function normalizePeak(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max === 0) return samples;
  const scale = peak / max;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  return samples;
}
