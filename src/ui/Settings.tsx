// Settings_Panel (design: "UI Components"; Requirements 1.9, 6.1, 13.1, 18.3, 19.2, 20.3, 21.1-21.3,
// 21.6, 25.2).
//
// The panel shows the stored Settings and reports each change through the callbacks in its props. It
// never calls the engine or the store. src/app/main.tsx wires the callbacks to engine.updateSettings,
// engine.eraseAll and the Demo_Mode URL. Every text goes through t().
//
// Numeric fields validate through applySettingInput. An out-of-range or off-step value leaves the
// stored value unchanged and shows the valid range (21.2).
//
// Nightmare_Mode can only be turned on through `onNightmareRequest`, which opens the content warning
// (Requirements 6.2-6.4). This panel never sets `nightmare` to true itself, so the Jump_Scare cannot
// fire from the toggle (6.11).
import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  SETTINGS_SPEC,
  applySettingInput,
  type Language,
  type NumericKey,
  type Settings as SettingsValues,
} from '../core/settings';
import { t, type MessageKey } from '../i18n';
import { NotificationControl, type NotifyStatus } from './NotificationControl';

export interface SettingsProps {
  readonly settings: ReadonlySignal<SettingsValues>;
  /** True when the App runs in Demo_Mode. The toggle then offers to leave it. */
  readonly demo: boolean;
  /** Stores the whole Settings object and applies it to the schedule (Requirements 1.9, 21.3). */
  readonly onUpdate: (next: SettingsValues) => void;
  /** Reloads the page with or without `demo=1` (Requirement 25.2). */
  readonly onToggleDemo: (enabled: boolean) => void;
  /** Deletes all App data and restores the defaults (Requirement 21.6). Called only after confirmation. */
  readonly onEraseAll: () => void;
  /**
   * Opens the Nightmare_Mode content warning. Without this callback the toggle cannot turn Nightmare_Mode
   * on, so the toggle stays off and disabled.
   */
  readonly onNightmareRequest?: () => void;
  /** The browser notification permission state (Requirements 15.1, 15.6). */
  readonly notificationStatus: ReadonlySignal<NotifyStatus>;
  /** Receives the notifications toggle. The parent requests the permission when `enable` is true (Requirement 15.1). */
  readonly onNotificationToggle: (enable: boolean) => void;
  /**
   * False when the browser lacks Document Picture-in-Picture. The panel then states the browser requirement of the
   * Ghost_Window (Requirement 17.7). Defaults to true, which shows nothing.
   */
  readonly ghostWindowSupported?: boolean;
  /** True when the browser provides the Idle Detection API. Without it, the toggle is hidden (Requirements 13.1, 13.8). */
  readonly awaySupported: boolean;
  /**
   * Receives the away-detection toggle. The parent requests the idle-detection permission from this callback when
   * `enable` is true, and turns the setting on only when the permission is granted (Requirements 13.2, 13.9).
   */
  readonly onAwayDetectionToggle: (enable: boolean) => void;
}

interface NumericGroup {
  readonly legend: MessageKey;
  readonly fields: ReadonlyArray<{ readonly key: NumericKey; readonly label: MessageKey }>;
}

const TIMING_FIELDS: NumericGroup = {
  legend: 'settings.groupTiming',
  fields: [
    { key: 'workIntervalMin', label: 'settings.workInterval' },
    { key: 'longBreakFrequency', label: 'settings.longBreakFrequency' },
    { key: 'escalationStepMin', label: 'settings.escalationStep' },
    { key: 'snoozeMin', label: 'settings.snooze' },
    { key: 'naturalBreakMin', label: 'settings.naturalBreak' },
  ],
};

const LANGUAGE_OPTIONS: ReadonlyArray<{ readonly value: Language; readonly label: MessageKey }> = [
  { value: 'en', label: 'settings.languageEn' },
  { value: 'zh-CN', label: 'settings.languageZhCN' },
];

interface NumericFieldProps {
  readonly id: string;
  readonly label: MessageKey;
  readonly specKey: NumericKey;
  readonly settings: SettingsValues;
  readonly onUpdate: (next: SettingsValues) => void;
}

/**
 * One numeric setting. The draft text is local, so the user can type freely. A commit (blur or
 * change) validates the draft: a valid value is stored, and an invalid one restores the stored value
 * and shows the range.
 */
function NumericField({ id, label, specKey, settings, onUpdate }: NumericFieldProps) {
  const { min, max, step } = SETTINGS_SPEC[specKey];
  const stored = settings[specKey];
  const [draft, setDraft] = useState(String(stored));
  const [rejected, setRejected] = useState(false);

  // A stored value that changes from outside this field (for example after erase-all) replaces the draft.
  useEffect(() => {
    setDraft(String(stored));
    setRejected(false);
  }, [stored]);

  const commit = (raw: string): void => {
    const parsed = raw.trim() === '' ? Number.NaN : Number(raw);
    if (parsed === stored) {
      setDraft(String(stored));
      setRejected(false);
      return;
    }
    const result = applySettingInput(settings, specKey, parsed);
    if (result.ok) {
      setRejected(false);
      onUpdate(result.settings);
    } else {
      setDraft(String(stored));
      setRejected(true);
    }
  };

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div class="sbr-field">
      <label for={id}>{t(label)}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-invalid={rejected ? 'true' : 'false'}
        aria-describedby={rejected ? `${hintId} ${errorId}` : hintId}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onChange={(event) => commit(event.currentTarget.value)}
      />
      <p id={hintId} class="sbr-note">
        {t('settings.range', { min, max, step })}
      </p>
      {rejected && (
        <p id={errorId} class="sbr-field-error" aria-live="polite">
          {t('settings.invalid', { min, max, step })}
        </p>
      )}
    </div>
  );
}

export function Settings({
  settings,
  demo,
  onUpdate,
  onToggleDemo,
  onEraseAll,
  onNightmareRequest,
  notificationStatus,
  onNotificationToggle,
  ghostWindowSupported = true,
  awaySupported,
  onAwayDetectionToggle,
}: SettingsProps) {
  const current = settings.value;
  const [confirmingErase, setConfirmingErase] = useState(false);
  const cancelEraseRef = useRef<HTMLButtonElement>(null);

  // Erasing is destructive, so the confirmation puts focus on Cancel, the safe choice.
  useEffect(() => {
    if (confirmingErase) cancelEraseRef.current?.focus();
  }, [confirmingErase]);

  const nightmareToggleDisabled = !current.nightmare && onNightmareRequest === undefined;

  return (
    <details class="sbr-panel sbr-settings">
      <summary>{t('settings.heading')}</summary>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t(TIMING_FIELDS.legend)}</legend>
        {TIMING_FIELDS.fields.map((field) => (
          <NumericField
            key={field.key}
            id={`sbr-setting-${field.key}`}
            label={field.label}
            specKey={field.key}
            settings={current}
            onUpdate={onUpdate}
          />
        ))}
      </fieldset>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupSound')}</legend>
        <NumericField
          id="sbr-setting-masterVolume"
          label="settings.masterVolume"
          specKey="masterVolume"
          settings={current}
          onUpdate={onUpdate}
        />
        <label class="sbr-check">
          <input
            type="checkbox"
            checked={current.muted}
            onChange={(event) => onUpdate({ ...current, muted: event.currentTarget.checked })}
          />
          {t('settings.mute')}
        </label>
      </fieldset>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupDisplay')}</legend>
        <div class="sbr-field">
          <label for="sbr-setting-reducedMotion">{t('settings.reducedMotion')}</label>
          <select
            id="sbr-setting-reducedMotion"
            value={current.reducedMotion}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'system' || value === 'on' || value === 'off') {
                onUpdate({ ...current, reducedMotion: value });
              }
            }}
          >
            <option value="system">{t('settings.motionSystem')}</option>
            <option value="on">{t('settings.motionOn')}</option>
            <option value="off">{t('settings.motionOff')}</option>
          </select>
        </div>
        <label class="sbr-check">
          <input
            type="checkbox"
            checked={current.nightmare}
            disabled={nightmareToggleDisabled}
            aria-describedby="sbr-setting-nightmare-hint"
            onChange={(event) => {
              if (event.currentTarget.checked) {
                // Turning on needs the content warning first. Keep the box off until the warning confirms it.
                event.currentTarget.checked = false;
                onNightmareRequest?.();
              } else {
                onUpdate({ ...current, nightmare: false });
              }
            }}
          />
          {t('settings.nightmare')}
        </label>
        <p id="sbr-setting-nightmare-hint" class="sbr-note">
          {t('settings.nightmareHint')}
          {onNightmareRequest === undefined && ` ${t('settings.nightmareUnavailable')}`}
        </p>
      </fieldset>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupLanguage')}</legend>
        <div class="sbr-field">
          <label for="sbr-setting-language">{t('settings.language')}</label>
          <select
            id="sbr-setting-language"
            value={current.language}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'en' || value === 'zh-CN') {
                onUpdate({ ...current, language: value });
              }
            }}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupDemo')}</legend>
        <label class="sbr-check">
          <input
            type="checkbox"
            checked={demo}
            aria-describedby="sbr-setting-demo-hint"
            onChange={(event) => onToggleDemo(event.currentTarget.checked)}
          />
          {t('settings.demo')}
        </label>
        <p id="sbr-setting-demo-hint" class="sbr-note">
          {t('settings.demoHint')}
        </p>
      </fieldset>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupNotify')}</legend>
        <NotificationControl
          id="sbr-setting-notifications"
          enabled={current.notifications}
          status={notificationStatus}
          showInstructions
          onToggle={onNotificationToggle}
        />
      </fieldset>

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupAway')}</legend>
        {awaySupported ? (
          <>
            <label class="sbr-check">
              <input
                id="sbr-setting-awayDetection"
                type="checkbox"
                checked={current.awayDetection}
                aria-describedby="sbr-setting-away-hint"
                onClick={(event) => {
                  const wanted = event.currentTarget.checked;
                  // Keep the box at its stored value until the setting changes. The parent requests the permission from this click.
                  event.currentTarget.checked = current.awayDetection;
                  onAwayDetectionToggle(wanted);
                }}
              />
              {t('settings.away')}
            </label>
            <p id="sbr-setting-away-hint" class="sbr-note">
              {t('settings.awayHint')}
            </p>
          </>
        ) : (
          <p class="sbr-note">{t('settings.awayUnsupported')}</p>
        )}
      </fieldset>

      {!ghostWindowSupported && (
        <fieldset class="sbr-settings-group">
          <legend class="sbr-settings-legend">{t('settings.groupGhost')}</legend>
          <p class="sbr-note">{t('settings.ghostUnsupported')}</p>
        </fieldset>
      )}

      <fieldset class="sbr-settings-group">
        <legend class="sbr-settings-legend">{t('settings.groupData')}</legend>
        <p class="sbr-note">{t('settings.eraseHint')}</p>
        {confirmingErase ? (
          <div class="sbr-button-row" role="group" aria-label={t('settings.erase')}>
            <p class="sbr-field-error">{t('settings.eraseConfirm')}</p>
            <button ref={cancelEraseRef} type="button" onClick={() => setConfirmingErase(false)}>
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingErase(false);
                onEraseAll();
              }}
            >
              {t('settings.eraseConfirmButton')}
            </button>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setConfirmingErase(true)}>
              {t('settings.erase')}
            </button>
          </div>
        )}
      </fieldset>
    </details>
  );
}
