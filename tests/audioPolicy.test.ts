// Example tests for the audio gain policy (Requirements 4.4, 5.4, 11.4, 13.7, 18.4-18.6, 22.2).
// The property test for Property 18 is task 11.5 and lives in its own file.
import { describe, expect, it } from 'vitest';
import {
  OFFICE_MIN_ATTACK_MS,
  SCREAM_ATTACK_MS,
  VOICE_ATTACK_MS,
  attackMsFor,
  envelopeGain,
  masterGain,
  nextWhisperDelayMs,
  whisperGainFor,
  type MasterGainInput,
} from '../src/core/audioPolicy';
import { createRng } from '../src/core/rng';

const audible: MasterGainInput = {
  volume: 0.3,
  muted: false,
  snoozed: false,
  idle: false,
  activeInstance: true,
  unlocked: true,
};

describe('masterGain', () => {
  it('equals Master_Volume when nothing silences the output (Requirement 18.4)', () => {
    expect(masterGain(audible)).toBe(0.3);
  });

  it('holds the gain at zero while Mute is on (Requirement 18.5)', () => {
    expect(masterGain({ ...audible, muted: true })).toBe(0);
  });

  it('holds the gain at zero during a Snooze (Requirement 11.4)', () => {
    expect(masterGain({ ...audible, snoozed: true })).toBe(0);
  });

  it('holds the gain at zero while the user is idle or the screen is locked (Requirement 13.7)', () => {
    expect(masterGain({ ...audible, idle: true })).toBe(0);
  });

  it('holds the gain at zero in an inactive instance', () => {
    expect(masterGain({ ...audible, activeInstance: false })).toBe(0);
  });

  it('holds the gain at zero until a user gesture unlocks audio (Requirement 18.1)', () => {
    expect(masterGain({ ...audible, unlocked: false })).toBe(0);
  });

  it('returns 0 and 1 for the volume bounds', () => {
    expect(masterGain({ ...audible, volume: 0 })).toBe(0);
    expect(masterGain({ ...audible, volume: 1 })).toBe(1);
  });

  it('rejects a volume outside [0, 1]', () => {
    expect(() => masterGain({ ...audible, volume: 1.01 })).toThrow(RangeError);
    expect(() => masterGain({ ...audible, volume: -0.1 })).toThrow(RangeError);
    expect(() => masterGain({ ...audible, volume: Number.NaN })).toThrow(RangeError);
  });
});

describe('whisperGainFor', () => {
  it('is zero below Haunting_Level 3', () => {
    expect(whisperGainFor(0)).toBe(0);
    expect(whisperGainFor(1)).toBe(0);
    expect(whisperGainFor(2)).toBe(0);
  });

  it('is 40%, 70% and 100% of Master_Volume at levels 3, 4 and 5 (Requirement 18.6)', () => {
    expect(whisperGainFor(3)).toBe(0.4);
    expect(whisperGainFor(4)).toBe(0.7);
    expect(whisperGainFor(5)).toBe(1);
  });

  it('rejects levels outside 0 to 5 and non-integer levels', () => {
    expect(() => whisperGainFor(6)).toThrow(RangeError);
    expect(() => whisperGainFor(-1)).toThrow(RangeError);
    expect(() => whisperGainFor(2.5)).toThrow(RangeError);
  });
});

describe('nextWhisperDelayMs', () => {
  it('returns whole milliseconds in [20 000, 40 000] (Requirement 4.4)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1_000; i++) {
      const delay = nextWhisperDelayMs(rng);
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(20_000);
      expect(delay).toBeLessThanOrEqual(40_000);
    }
  });

  it('spreads the delays across the whole range over many draws', () => {
    const rng = createRng(11);
    const seen = Array.from({ length: 5_000 }, () => nextWhisperDelayMs(rng));
    expect(Math.min(...seen)).toBeLessThan(20_200);
    expect(Math.max(...seen)).toBeGreaterThan(39_800);
  });

  it('gives the same sequence for the same seed', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 20; i++) {
      expect(nextWhisperDelayMs(a)).toBe(nextWhisperDelayMs(b));
    }
  });
});

describe('attackMsFor', () => {
  it('uses the 2.5 s attack for every voice in Office_Safe_Mode (Requirement 5.4)', () => {
    expect(attackMsFor({ scream: false, nightmare: false })).toBe(VOICE_ATTACK_MS);
    expect(attackMsFor({ scream: true, nightmare: false })).toBe(VOICE_ATTACK_MS);
    expect(VOICE_ATTACK_MS).toBeGreaterThanOrEqual(OFFICE_MIN_ATTACK_MS);
  });

  it('uses the 10 ms attack only for the scream in Nightmare_Mode', () => {
    expect(attackMsFor({ scream: true, nightmare: true })).toBe(SCREAM_ATTACK_MS);
    expect(attackMsFor({ scream: false, nightmare: true })).toBe(VOICE_ATTACK_MS);
  });
});

describe('envelopeGain', () => {
  it('starts from silence and reaches the target at the end of the attack', () => {
    expect(envelopeGain(0, 0.3, VOICE_ATTACK_MS)).toBe(0);
    expect(envelopeGain(VOICE_ATTACK_MS / 2, 0.3, VOICE_ATTACK_MS)).toBeCloseTo(0.15, 10);
    expect(envelopeGain(VOICE_ATTACK_MS, 0.3, VOICE_ATTACK_MS)).toBe(0.3);
    expect(envelopeGain(10 * VOICE_ATTACK_MS, 0.3, VOICE_ATTACK_MS)).toBe(0.3);
  });

  it('rejects negative elapsed time and targets outside [0, 1]', () => {
    expect(() => envelopeGain(-1, 0.3, VOICE_ATTACK_MS)).toThrow(RangeError);
    expect(() => envelopeGain(0, 1.5, VOICE_ATTACK_MS)).toThrow(RangeError);
  });
});
