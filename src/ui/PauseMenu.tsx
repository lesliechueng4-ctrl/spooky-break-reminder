// PauseMenu (design: "UI Components"; Requirements 12.1, 12.3, 19.5, 19.6).
//
// Shown in Calm_State. With no Pause running it offers 30, 60 and 120 minutes or a Pause until the
// user resumes. While a Pause runs it shows the remaining Pause time (or "until you resume") and a
// Resume button. The component receives callbacks and never touches the engine (src/app/main.tsx
// wires them). The text sits on an opaque panel (Requirements 4.10, 19.6).
import { formatClock } from '../core/tabStatus';
import { MINUTE_MS } from '../core/time';
import { t } from '../i18n';

/** The fixed Pause durations in minutes (Requirement 12.1). "Until resumed" is the extra choice. */
export const PAUSE_CHOICES_MIN = [30, 60, 120] as const;

export interface PauseMenuProps {
  /** The Pause of the Calm view: null when none runs, `remainingMs` null when the Pause lasts until resumed. */
  readonly pause: { readonly remainingMs: number | null } | null;
  /** True while a Ritual runs. The Scheduler ignores a Pause start then, so its buttons are disabled. */
  readonly busy: boolean;
  /** Starts a Pause in schedule milliseconds, or until resumed when null. */
  readonly onPause?: (durationMs: number | null) => void;
  /** Ends the Pause. */
  readonly onResume?: () => void;
}

export function PauseMenu({ pause, busy, onPause, onResume }: PauseMenuProps) {
  if (pause !== null) {
    const status =
      pause.remainingMs === null
        ? t('pause.untilResumedActive')
        : t('pause.remaining', { time: formatClock(pause.remainingMs) });
    return (
      <div class="sbr-panel sbr-controls" role="group" aria-label={t('pause.heading')}>
        <p class="sbr-note">{status}</p>
        <button type="button" disabled={onResume === undefined} onClick={() => onResume?.()}>
          {t('pause.resume')}
        </button>
      </div>
    );
  }

  return (
    <div class="sbr-panel sbr-controls" role="group" aria-label={t('pause.heading')}>
      <h3 class="sbr-controls-heading">{t('pause.heading')}</h3>
      <div class="sbr-button-row">
        {PAUSE_CHOICES_MIN.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={busy || onPause === undefined}
            onClick={() => onPause?.(minutes * MINUTE_MS)}
          >
            {t('pause.minutes', { minutes })}
          </button>
        ))}
        <button type="button" disabled={busy || onPause === undefined} onClick={() => onPause?.(null)}>
          {t('pause.untilResumed')}
        </button>
      </div>
    </div>
  );
}
