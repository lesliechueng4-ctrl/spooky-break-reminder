// NotificationControl (design: "UI Components"; Requirements 15.1, 15.6, 24.3, 24.4).
//
// The opt-in toggle for system notifications, with the permission status under it. The component reports
// the user's choice through `onToggle` and never calls the Notifier, the engine or the store. The parent
// (src/app/main.tsx) requests the browser permission in that callback, which runs inside the click handler.
//
// The box shows the stored setting only when the permission is also granted. A click never changes the box
// by itself: the box returns to its stored state, and the parent's update to the setting moves it.
// Every text goes through t(), and the status text sits on the parent's opaque panel (Requirement 19.6).
import type { ReadonlySignal } from '@preact/signals';
import { t, type MessageKey } from '../i18n';

/** The permission state shown in the control. Matches the Notifier's status values. */
export type NotifyStatus = 'unsupported' | 'default' | 'granted' | 'denied';

const STATUS_KEY: Readonly<Record<NotifyStatus, MessageKey>> = {
  granted: 'notify.status.granted',
  default: 'notify.status.default',
  denied: 'notify.status.denied',
  unsupported: 'notify.status.unsupported',
};

export interface NotificationControlProps {
  /** Prefix for the element ids. Settings and Onboarding use different prefixes, so the ids stay unique. */
  readonly id: string;
  /** The stored notifications setting. */
  readonly enabled: boolean;
  /** The permission state, read from the Notifier. */
  readonly status: ReadonlySignal<NotifyStatus>;
  /** Adds the site-settings instructions for a denied or missing permission (Requirement 15.6). */
  readonly showInstructions: boolean;
  /** Receives the requested state. The parent requests the permission from here when `enable` is true. */
  readonly onToggle: (enable: boolean) => void;
}

export function NotificationControl({ id, enabled, status, showInstructions, onToggle }: NotificationControlProps) {
  const current = status.value;
  const checked = enabled && current === 'granted';
  const statusId = `${id}-status`;
  const needsInstructions = current === 'denied' || current === 'unsupported';

  return (
    <div class="sbr-notify">
      <label class="sbr-check">
        <input
          id={`${id}-toggle`}
          type="checkbox"
          checked={checked}
          disabled={current === 'unsupported'}
          aria-describedby={statusId}
          onClick={(event) => {
            const wanted = event.currentTarget.checked;
            // Keep the box at its stored state until the setting changes. The click alone must not show a
            // value the App has not accepted.
            event.currentTarget.checked = checked;
            onToggle(wanted);
          }}
        />
        {t('notify.toggle')}
      </label>
      <p id={statusId} class="sbr-note" aria-live="polite">
        {t(STATUS_KEY[current])}
      </p>
      {showInstructions && needsInstructions && <p class="sbr-note">{t('notify.siteSettings')}</p>}
    </div>
  );
}
