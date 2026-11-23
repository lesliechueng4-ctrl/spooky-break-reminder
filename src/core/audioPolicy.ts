// Audio gain policy (design: "Core: Policies"; Requirements 4.4, 5.4, 11.4, 13.7, 18.4-18.6,
// 22.2). Pure core: no clock, no randomness source, no DOM. The Audio_Engine in src/platform
// applies these values to the Web Audio graph. Gains are linear factors, so 1 is Master_Volume.

import { WHISPER_GAIN_BY_LEVEL } from './escalation';
import type { Rng } from './rng';

/** Shortest and longest gap between two Whispers, in milliseconds (Requirement 4.4). */
export const WHISPER_DELAY_MIN_MS = 20_000;
export const WHISPER_DELAY_MAX_MS = 40_000;

/** Attack of every voice in Office_Safe_Mode and of the other Nightmare_Mode voices (Requirement 5.4). */
export const VOICE_ATTACK_MS = 2_500;

/** Attack of the Nightmare_Mode scream. It is the only voice with a short attack (design: audio engine). */
export const SCREAM_ATTACK_MS = 10;

/** Minimum attack that Requirement 5.4 allows in Office_Safe_Mode. */
export const OFFICE_MIN_ATTACK_MS = 2_000;

export interface MasterGainInput {
  /** Master_Volume as a fraction in [0, 1] (Requirement 18.4). */
  readonly volume: number;
  /** Mute is on (Requirement 18.5). */
  readonly muted: boolean;
  /** A Snooze is active (Requirement 11.4). */
  readonly snoozed: boolean;
  /** The Idle_Monitor reports the user as idle or the screen as locked (Requirement 13.7). */
  readonly idle: boolean;
  /** This tab is the Active_Instance that runs the Scheduler (design: instance lock). */
  readonly activeInstance: boolean;
  /** The Audio_Engine has been unlocked by a user gesture (Requirement 18.1). */
  readonly unlocked: boolean;
}

/**
 * The gain of the master node. Every sound passes through it, so no sound exceeds Master_Volume
 * (Requirement 18.4). It is zero while Mute, a Snooze, an idle or locked report, an inactive
 * instance or a locked audio context applies (Requirements 18.5, 11.4, 13.7).
 */
export function masterGain(c: MasterGainInput): number {
  assertUnitInterval(c.volume, 'volume');
  const silenced = c.muted || c.snoozed || c.idle || !c.activeInstance || !c.unlocked;
  return silenced ? 0 : c.volume;
}

/**
 * Whisper gain as a fraction of Master_Volume at a Haunting_Level: 0 below level 3, then 0.4,
 * 0.7 and 1.0 at levels 3, 4 and 5 (Requirement 18.6). Reads WHISPER_GAIN_BY_LEVEL from
 * escalation.ts, so the table is defined in one place.
 */
export function whisperGainFor(level: number): number {
  const maxLevel = WHISPER_GAIN_BY_LEVEL.length - 1;
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) {
    throw new RangeError(`audioPolicy: level must be an integer from 0 to ${maxLevel}, got ${String(level)}`);
  }
  return WHISPER_GAIN_BY_LEVEL[level];
}

/**
 * Delay in whole milliseconds until the next Whisper, uniform in [20 000, 40 000] (Requirement 4.4).
 * The caller passes a seeded Rng, so a given seed gives the same sequence of delays.
 */
export function nextWhisperDelayMs(rng: Rng): number {
  return rng.nextInt(WHISPER_DELAY_MIN_MS, WHISPER_DELAY_MAX_MS);
}

/**
 * Attack time of a voice. The scream uses the short attack only in Nightmare_Mode. Every other
 * voice, and the scream outside Nightmare_Mode, rises over VOICE_ATTACK_MS (Requirement 5.4).
 */
export function attackMsFor(voice: { readonly scream: boolean; readonly nightmare: boolean }): number {
  return voice.scream && voice.nightmare ? SCREAM_ATTACK_MS : VOICE_ATTACK_MS;
}

/**
 * Gain of a voice `elapsedMs` after its start. It rises linearly from 0 to `target` over
 * `attackMs` and then holds at `target`. Every voice in Office_Safe_Mode uses an attack of at
 * least OFFICE_MIN_ATTACK_MS (Requirement 5.4).
 */
export function envelopeGain(elapsedMs: number, target: number, attackMs: number): number {
  assertNonNegativeFinite(elapsedMs, 'elapsedMs');
  assertUnitInterval(target, 'target');
  assertNonNegativeFinite(attackMs, 'attackMs');
  if (attackMs === 0 || elapsedMs >= attackMs) {
    return target;
  }
  return target * (elapsedMs / attackMs);
}

function assertUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`audioPolicy: ${name} must be in [0, 1], got ${String(value)}`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`audioPolicy: ${name} must be a finite number >= 0, got ${String(value)}`);
  }
}
