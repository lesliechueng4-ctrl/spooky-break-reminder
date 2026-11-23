// Stored record format (Requirements 14.1, 21.1, 21.2, 21.4). Pure core: this module formats and
// validates strings. The storage adapter in src/platform reads and writes the keys it names.
import { SETTINGS_SPEC, parseSettings, type Settings } from './settings';
import { SPEED } from './time';

export const STORAGE_VERSION = 1;
/** Every App key starts with this prefix, so "erase all data" can remove them (Requirement 21.6). */
export const APP_KEY_PREFIX = 'sbr:';

export type StoreKind = 'settings' | 'meta' | 'schedule' | 'log';
/** Normal use and Demo_Mode keep separate schedule and log keys (Requirement 25.7). */
export type StorageMode = 'normal' | 'demo';

export type BreakType = 'micro' | 'long';

export interface CalmPhase {
  kind: 'calm';
  workElapsedMs: number;
  pause: { remainingMs: number | null } | null;
}

export interface HauntPhase {
  kind: 'haunting';
  breakType: BreakType;
  overdueMs: number;
  escalationStepMs: number;
  /** The Snooze_Duration snapshot in schedule ms: the Settings minutes times the speed of the mode (25.4). */
  snoozeMs: number;
  snoozesUsed: 0 | 1 | 2 | 3;
  snoozeRemainingMs: number;
  jumpScareShown: boolean;
  seed: number;
}

/** The schedule state as stored. The Scheduler's transient ritual field is never persisted. */
export interface PersistedScheduleState {
  phase: CalmPhase | HauntPhase;
  breakCounter: number;
}

/** Stored under `sbr:v1:schedule` or `sbr:v1:demo:schedule`. */
export interface PersistedSchedule {
  state: PersistedScheduleState;
  lastAliveWall: number;
  frozenAtWall: number | null;
  awayOpenSinceWall: number | null;
}

/** Stored under `sbr:v1:log` or `sbr:v1:demo:log`. */
export interface DailyLog {
  day: string;
  eye: number;
  breathing: number;
  stretch: number;
  away: number;
  snoozes: number;
}

/** Stored under `sbr:v1:meta`, shared by normal use and Demo_Mode. */
export interface Meta {
  onboarded: boolean;
}

export interface StoredRecords {
  settings: Settings;
  meta: Meta;
  schedule: PersistedSchedule;
  log: DailyLog;
}

/**
 * Returns the storage key for a record. Settings and Meta are shared by both modes, so their
 * keys never change with the mode. Schedule and log keys get a `demo:` segment in Demo_Mode.
 */
export function storageKey(kind: StoreKind, mode: StorageMode): string {
  const shared = kind === 'settings' || kind === 'meta';
  const scope = shared || mode === 'normal' ? '' : 'demo:';
  return `${APP_KEY_PREFIX}v${STORAGE_VERSION}:${scope}${kind}`;
}

/** Wraps a record in the envelope `{ "v": 1, "kind": ..., "data": ... }`. */
export function serialize<K extends StoreKind>(kind: K, value: StoredRecords[K]): string {
  return JSON.stringify({ v: STORAGE_VERSION, kind, data: value });
}

/**
 * Parses stored text for one kind. Returns null on any violation: unreadable JSON, another
 * version or kind, extra or missing envelope keys, or data that fails the kind's validator.
 * A null `text` (no stored record) also returns null, so callers check `text === null` first
 * to tell a missing record from an invalid one.
 */
export function parseStored<K extends StoreKind>(kind: K, text: string | null): StoredRecords[K] | null {
  if (text === null) return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(envelope) || !hasExactKeys(envelope, ['v', 'kind', 'data'])) return null;
  if (envelope.v !== STORAGE_VERSION || envelope.kind !== kind) return null;
  return VALIDATORS[kind](envelope.data) as StoredRecords[K] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableTimestamp(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

/** True for a real calendar day in the form YYYY-MM-DD (rejects 2026-02-30). */
function isLocalDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const MS_PER_MINUTE = 60_000;

function isMsInSpecRange(value: unknown, key: 'escalationStepMin'): value is number {
  const { min, max } = SETTINGS_SPEC[key];
  return isNonNegativeInteger(value) && value >= min * MS_PER_MINUTE && value <= max * MS_PER_MINUTE;
}

/**
 * A Snooze_Duration snapshot in schedule ms. It is a whole number of Settings minutes in range, times the speed of a
 * mode (1 in normal use, 60 in Demo_Mode), because a Snooze lasts its wall-clock length (25.4).
 */
function isSnoozeScheduleMs(value: unknown): value is number {
  if (!isNonNegativeInteger(value)) return false;
  const { min, max } = SETTINGS_SPEC.snoozeMin;
  return [SPEED.normal, SPEED.demo].some((speed) => {
    const minutes = value / (MS_PER_MINUTE * speed);
    return Number.isInteger(minutes) && minutes >= min && minutes <= max;
  });
}

function isBreakType(value: unknown): value is BreakType {
  return value === 'micro' || value === 'long';
}

function parseCalmPhase(value: Record<string, unknown>): CalmPhase | null {
  if (!hasExactKeys(value, ['kind', 'workElapsedMs', 'pause'])) return null;
  if (!isNonNegativeInteger(value.workElapsedMs)) return null;
  const pause = value.pause;
  if (pause !== null) {
    if (!isRecord(pause) || !hasExactKeys(pause, ['remainingMs'])) return null;
    if (pause.remainingMs !== null && !isNonNegativeInteger(pause.remainingMs)) return null;
  }
  return {
    kind: 'calm',
    workElapsedMs: value.workElapsedMs,
    pause: pause === null ? null : { remainingMs: pause.remainingMs as number | null },
  };
}

function parseHauntPhase(value: Record<string, unknown>): HauntPhase | null {
  const keys = ['kind', 'breakType', 'overdueMs', 'escalationStepMs', 'snoozeMs',
    'snoozesUsed', 'snoozeRemainingMs', 'jumpScareShown', 'seed'];
  if (!hasExactKeys(value, keys)) return null;
  const { breakType, overdueMs, escalationStepMs, snoozeMs, snoozesUsed, snoozeRemainingMs, jumpScareShown, seed } = value;
  if (!isBreakType(breakType)) return null;
  if (!isNonNegativeInteger(overdueMs)) return null;
  if (!isMsInSpecRange(escalationStepMs, 'escalationStepMin')) return null;
  if (!isSnoozeScheduleMs(snoozeMs)) return null;
  if (snoozesUsed !== 0 && snoozesUsed !== 1 && snoozesUsed !== 2 && snoozesUsed !== 3) return null;
  if (!isNonNegativeInteger(snoozeRemainingMs) || snoozeRemainingMs > snoozeMs) return null;
  if (typeof jumpScareShown !== 'boolean') return null;
  if (!isNonNegativeInteger(seed)) return null;
  return {
    kind: 'haunting',
    breakType,
    overdueMs,
    escalationStepMs,
    snoozeMs,
    snoozesUsed,
    snoozeRemainingMs,
    jumpScareShown,
    seed,
  };
}

function parseSchedule(value: unknown): PersistedSchedule | null {
  if (!isRecord(value) || !hasExactKeys(value, ['state', 'lastAliveWall', 'frozenAtWall', 'awayOpenSinceWall'])) {
    return null;
  }
  const { state, lastAliveWall, frozenAtWall, awayOpenSinceWall } = value;
  if (!isRecord(state) || !hasExactKeys(state, ['phase', 'breakCounter'])) return null;
  if (!isNonNegativeInteger(state.breakCounter)) return null;
  if (!isRecord(state.phase)) return null;

  let phase: CalmPhase | HauntPhase | null;
  if (state.phase.kind === 'calm') {
    phase = parseCalmPhase(state.phase);
  } else if (state.phase.kind === 'haunting') {
    phase = parseHauntPhase(state.phase);
  } else {
    phase = null;
  }
  if (phase === null) return null;
  if (!isNonNegativeInteger(lastAliveWall) || !isNullableTimestamp(frozenAtWall) || !isNullableTimestamp(awayOpenSinceWall)) {
    return null;
  }
  return {
    state: { phase, breakCounter: state.breakCounter },
    lastAliveWall,
    frozenAtWall,
    awayOpenSinceWall,
  };
}

function parseLog(value: unknown): DailyLog | null {
  const keys = ['day', 'eye', 'breathing', 'stretch', 'away', 'snoozes'];
  if (!isRecord(value) || !hasExactKeys(value, keys)) return null;
  const { day, eye, breathing, stretch, away, snoozes } = value;
  if (!isLocalDay(day)) return null;
  if (![eye, breathing, stretch, away, snoozes].every(isNonNegativeInteger)) return null;
  return {
    day,
    eye: eye as number,
    breathing: breathing as number,
    stretch: stretch as number,
    away: away as number,
    snoozes: snoozes as number,
  };
}

function parseMeta(value: unknown): Meta | null {
  if (!isRecord(value) || !hasExactKeys(value, ['onboarded'])) return null;
  return typeof value.onboarded === 'boolean' ? { onboarded: value.onboarded } : null;
}

const VALIDATORS: { readonly [K in StoreKind]: (data: unknown) => StoredRecords[K] | null } = {
  settings: parseSettings,
  meta: parseMeta,
  schedule: parseSchedule,
  log: parseLog,
};
