// Settings schema, defaults and validation (Requirements 1.1, 5.1, 6.1, 13.1, 21.1, 21.2, 21.4).
// Pure core: no DOM, no storage, no clock. Persistence of these values lives in persistence.ts.

/**
 * One table drives the defaults, the ranges and the validation of the numeric settings.
 * Durations are whole minutes here; the Scheduler converts them to integer milliseconds.
 */
export const SETTINGS_SPEC = {
  workIntervalMin: { min: 5, max: 90, step: 1, def: 20 },
  longBreakFrequency: { min: 1, max: 10, step: 1, def: 3 },
  escalationStepMin: { min: 1, max: 10, step: 1, def: 2 },
  snoozeMin: { min: 1, max: 15, step: 1, def: 5 },
  naturalBreakMin: { min: 1, max: 30, step: 1, def: 5 },
  masterVolume: { min: 0, max: 100, step: 5, def: 30 },
} as const;

export type NumericKey = keyof typeof SETTINGS_SPEC;

/** The valid values of one numeric setting: min to max in steps of `step`. */
export interface Range {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type Language = 'en' | 'zh-CN';
export type ReducedMotionSetting = 'system' | 'on' | 'off';

export interface Settings {
  workIntervalMin: number;
  longBreakFrequency: number;
  escalationStepMin: number;
  snoozeMin: number;
  naturalBreakMin: number;
  masterVolume: number;
  muted: boolean;
  nightmare: boolean;
  reducedMotion: ReducedMotionSetting;
  awayDetection: boolean;
  notifications: boolean;
  language: Language;
}

/** Result of changing one numeric setting. A rejected change keeps `settings` unchanged. */
export type SettingUpdate =
  | { ok: true; settings: Settings }
  | { ok: false; settings: Settings; range: Range };

type FlagKey = Exclude<keyof Settings, NumericKey>;

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';

// Typed as a mapped type over FlagKey, so adding a Settings field without a validator fails to compile.
const FLAG_VALIDATORS: { readonly [K in FlagKey]: (value: unknown) => boolean } = {
  muted: isBoolean,
  nightmare: isBoolean,
  reducedMotion: (value) => value === 'system' || value === 'on' || value === 'off',
  awayDetection: isBoolean,
  notifications: isBoolean,
  language: (value) => value === 'en' || value === 'zh-CN',
};

const NUMERIC_KEYS = Object.keys(SETTINGS_SPEC) as NumericKey[];
const FLAG_KEYS = Object.keys(FLAG_VALIDATORS) as FlagKey[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

/** True when `value` is an integer inside the range of `key` and on one of its steps. */
export function isValidNumeric(key: NumericKey, value: unknown): value is number {
  const { min, max, step } = SETTINGS_SPEC[key];
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= min
    && value <= max
    && (value - min) % step === 0;
}

/** Returns the defaults from SETTINGS_SPEC and the flag defaults (Requirements 1.1, 5.1, 6.1, 13.1). */
export function defaultSettings(language: Language = 'en'): Settings {
  const numericDefaults = Object.fromEntries(
    NUMERIC_KEYS.map((key) => [key, SETTINGS_SPEC[key].def]),
  ) as Pick<Settings, NumericKey>;
  return {
    ...numericDefaults,
    muted: false,
    nightmare: false,
    reducedMotion: 'system',
    awayDetection: false,
    notifications: false,
    language,
  };
}

/**
 * Validates untrusted data against the settings schema. Returns null on any violation:
 * a non-object, a missing or extra key, or a value outside its type, range or step.
 */
export function parseSettings(raw: unknown): Settings | null {
  if (!isRecord(raw)) return null;
  if (!hasExactKeys(raw, [...NUMERIC_KEYS, ...FLAG_KEYS])) return null;
  for (const key of NUMERIC_KEYS) {
    if (!isValidNumeric(key, raw[key])) return null;
  }
  for (const key of FLAG_KEYS) {
    if (!FLAG_VALIDATORS[key](raw[key])) return null;
  }
  return { ...raw } as unknown as Settings;
}

/**
 * Applies one numeric change from the Settings_Panel. An out-of-range or off-step value is
 * rejected, the previous settings come back unchanged, and the valid range is returned (21.2).
 */
export function applySettingInput(settings: Settings, key: NumericKey, value: number): SettingUpdate {
  const { min, max, step } = SETTINGS_SPEC[key];
  if (!isValidNumeric(key, value)) {
    return { ok: false, settings, range: { min, max, step } };
  }
  return { ok: true, settings: { ...settings, [key]: value } };
}
