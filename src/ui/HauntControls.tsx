// HauntControls (design: "UI Components"; Requirements 3.5, 7.1, 7.2, 11.1, 11.6, 11.8, 19.5, 19.6).
//
// Shown during a Haunting. It offers the Ritual buttons of the due break, the Snooze button, the
// remaining Snooze time and the message that appears after the third Snooze. The component receives
// callbacks and never touches the engine: the app shell wires the callbacks (src/app/main.tsx).
// The controls sit on an opaque panel, so their text keeps a contrast ratio of at least 4.5:1 over
// the effects (Requirements 4.10, 19.6). Every control is a native button, so the keyboard and the
// pointer both work and the global focus style applies (Requirement 19.5).
import type { RitualKind, ScheduleView } from '../core/scheduler';
import { formatClock } from '../core/tabStatus';
import { MINUTE_MS } from '../core/time';
import { t } from '../i18n';
import { RITUAL_KEY } from './labels';

export type HauntView = Extract<ScheduleView, { phase: 'haunting' }>;

export interface HauntControlsProps {
  readonly view: HauntView;
  /** Starts a Ritual that the Haunting offers. Without a handler the Ritual buttons are disabled. */
  readonly onStartRitual?: (kind: RitualKind) => void;
  /** Snoozes the Haunting. Without a handler the Snooze button is disabled. */
  readonly onSnooze?: () => void;
}

export function HauntControls({ view, onStartRitual, onSnooze }: HauntControlsProps) {
  // A running Ritual owns the screen: no second Ritual and no Snooze until it ends (Requirement 11.9).
  const ritualRunning = view.ritual !== null;
  const snoozeActive = view.snoozeRemainingMs > 0;
  const snoozeMinutes = Math.floor(view.snoozeMs / MINUTE_MS);

  return (
    <div id="sbr-haunt-controls" class="sbr-panel sbr-controls" role="group" aria-label={t('haunt.controls')}>
      <div class="sbr-button-row">
        {view.offered.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={ritualRunning || onStartRitual === undefined}
            onClick={() => onStartRitual?.(kind)}
          >
            {t('haunt.startRitual', { ritual: t(RITUAL_KEY[kind]) })}
          </button>
        ))}
      </div>

      {view.snoozesLeft > 0 ? (
        <button
          type="button"
          disabled={ritualRunning || snoozeActive || onSnooze === undefined}
          onClick={() => onSnooze?.()}
        >
          {t('snooze.button', { minutes: snoozeMinutes })}
        </button>
      ) : (
        <p class="sbr-note">{t('snooze.none')}</p>
      )}

      {snoozeActive && (
        <p class="sbr-note">
          {t('snooze.remaining', { time: formatClock(view.snoozeRemainingMs) })}
        </p>
      )}
    </div>
  );
}
