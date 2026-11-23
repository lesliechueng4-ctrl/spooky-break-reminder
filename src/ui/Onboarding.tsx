// Onboarding_Screen (design: "UI Components"; Requirements 24.1-24.7, 18.1, 18.2).
//
// The screen replaces the Main_Screen until the onboarded flag is set (Requirement 24.1). It explains the
// escalation, the three Rituals and the two intensity modes, and says that data stays in the browser, that
// sound is optional, and that away detection and notifications are off by default. The prose stays within
// 120 words per language (Requirement 24.2).
//
// The component reports three intents through its props: the Start press, the Demo_Mode choice and the
// notifications toggle. It never
// calls the engine, the store or an audio adapter. src/app/main.tsx wires Start to the Audio_Engine unlock,
// which must run inside the click (Requirements 18.1, 24.7), and then to engine.completeOnboarding (24.6).
// Every text goes through t(), and every text sits on an opaque .sbr-panel (Requirements 4.10, 19.6).
import type { ReadonlySignal } from '@preact/signals';
import { t } from '../i18n';
import { NotificationControl, type NotifyStatus } from './NotificationControl';

export interface OnboardingProps {
  /** True when the App runs in Demo_Mode. The checkbox then offers to leave it. */
  readonly demo: boolean;
  /** Reloads the page with or without `demo=1` before Start (Requirement 24.5). */
  readonly onToggleDemo: (enabled: boolean) => void;
  /** Start: unlocks audio and starts the first Work_Interval (Requirements 24.6, 24.7). */
  readonly onStart: () => void;
  /** The browser notification permission state (Requirement 24.3). */
  readonly notificationStatus: ReadonlySignal<NotifyStatus>;
  /** The stored notifications setting. */
  readonly notificationsEnabled: ReadonlySignal<boolean>;
  /** Receives the notifications toggle. The parent requests the permission when `enable` is true (Requirement 24.4). */
  readonly onNotificationToggle: (enable: boolean) => void;
}

export function Onboarding({
  demo,
  onToggleDemo,
  onStart,
  notificationStatus,
  notificationsEnabled,
  onNotificationToggle,
}: OnboardingProps) {
  return (
    <main id="sbr-main" class="sbr-main" tabIndex={-1}>
      <section class="sbr-panel sbr-onboarding" aria-labelledby="sbr-onboarding-title">
        <h1 id="sbr-onboarding-title" class="sbr-title">
          {t('app.name')}
        </h1>
        <p>{t('onboarding.intro')}</p>
        <p>{t('onboarding.escalation')}</p>
        <p>{t('onboarding.rituals')}</p>
        <p>{t('onboarding.modes')}</p>
        <p class="sbr-note">{t('onboarding.privacy')}</p>
        <p class="sbr-note">{t('onboarding.sound')}</p>
        <p class="sbr-note">{t('onboarding.optional')}</p>
        <NotificationControl
          id="sbr-onboarding-notifications"
          enabled={notificationsEnabled.value}
          status={notificationStatus}
          showInstructions={false}
          onToggle={onNotificationToggle}
        />
        <label class="sbr-check">
          <input
            type="checkbox"
            checked={demo}
            onChange={(event) => onToggleDemo(event.currentTarget.checked)}
          />
          {t('onboarding.demo')}
        </label>
        <button type="button" class="sbr-onboarding-start" onClick={onStart}>
          {t('onboarding.start')}
        </button>
      </section>
    </main>
  );
}
