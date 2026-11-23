// Notices (design: "UI Components"; Requirements 13.6, 21.4, 21.5, 22.1).
//
// The component shows the notices the App has raised: the saved-data reset (21.4), the "changes will not
// be saved" notice when storage is unavailable or full (21.5), the welcome-back message after an
// Away_Period of at least Natural_Break_Duration (13.6), and the take-over notice of a tab that is not the
// Active_Instance (22.1). The signals and the callbacks come from src/app/main.tsx, which writes the store.
// This file does not import the store, because src/ui may import only src/core and src/i18n.
//
// Most notices have a dismiss button. The take-over notice has a take-over button instead, because it must
// stay until this tab becomes the Active_Instance.
//
// The list is a polite live region that stays in the DOM while it is empty, so a notice added later is
// announced. Each control is a native button: Enter, Space and a pointer click all activate it. After a
// dismissal or a take-over, focus moves to the first remaining button, or to the Main_Screen when none is
// left, so a keyboard user does not lose their place. Every text sits on an opaque .sbr-panel (Requirements
// 4.10, 19.6).
import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { t, type MessageKey, type MessageParams } from '../i18n';

/** A notice that stays until the user dismisses it, or until its condition clears. The values match the store's notice kinds. */
export type NoticeId = 'reset' | 'notSaved' | 'awayDenied' | 'instanceInactive';

/** The welcome-back data: the Away_Period length in whole minutes (Requirement 13.6). */
export interface WelcomeBackNotice {
  readonly awayMinutes: number;
}

export interface NoticesProps {
  readonly notices: ReadonlySignal<readonly NoticeId[]>;
  readonly welcomeBack: ReadonlySignal<WelcomeBackNotice | null>;
  /** Removes one notice from the store. */
  readonly onDismiss: (notice: NoticeId) => void;
  /** Clears the welcome-back message from the store. */
  readonly onDismissWelcomeBack: () => void;
  /** Asks the instance lock to take over from the Active_Instance (Requirement 22.3). Called from a click. */
  readonly onTakeOver: () => void;
}

const NOTICE_TEXT: Readonly<Record<NoticeId, { readonly title: MessageKey; readonly message: MessageKey }>> = {
  reset: { title: 'notice.reset.title', message: 'notice.reset.message' },
  notSaved: { title: 'notice.notSaved.title', message: 'notice.notSaved.message' },
  awayDenied: { title: 'notice.awayDenied.title', message: 'notice.awayDenied.message' },
  instanceInactive: { title: 'notice.instanceInactive.title', message: 'notice.instanceInactive.message' },
};

/** The one button of a notice: a dismiss control, or the take-over control of the instance notice. */
type NoticeControl =
  | { readonly kind: 'dismiss'; readonly run: () => void }
  | { readonly kind: 'takeOver'; readonly run: () => void };

interface NoticeItem {
  readonly key: string;
  readonly title: MessageKey;
  readonly message: MessageKey;
  readonly params?: MessageParams;
  readonly control: NoticeControl;
}

export function Notices({ notices, welcomeBack, onDismiss, onDismissWelcomeBack, onTakeOver }: NoticesProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Set just before a control runs. The next commit moves focus, because the activated button can be gone by then.
  const focusPending = useRef(false);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    const next = listRef.current?.querySelector<HTMLButtonElement>('button');
    (next ?? document.getElementById('sbr-main'))?.focus();
  });

  const items: NoticeItem[] = notices.value.map((kind) => ({
    key: kind,
    ...NOTICE_TEXT[kind],
    control:
      kind === 'instanceInactive'
        ? { kind: 'takeOver', run: onTakeOver }
        : { kind: 'dismiss', run: () => onDismiss(kind) },
  }));
  const welcome = welcomeBack.value;
  if (welcome !== null) {
    items.push({
      key: 'welcomeBack',
      title: 'notice.welcomeBack.title',
      message: 'notice.welcomeBack.message',
      params: { minutes: welcome.awayMinutes },
      control: { kind: 'dismiss', run: onDismissWelcomeBack },
    });
  }

  return (
    <div class="sbr-notices">
      <div ref={listRef} class="sbr-notices-list" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const title = t(item.title);
          const isTakeOver = item.control.kind === 'takeOver';
          return (
            <div key={item.key} class="sbr-panel sbr-notice">
              <div class="sbr-notice-text">
                <p class="sbr-notice-title">{title}</p>
                <p class="sbr-notice-message">{t(item.message, item.params)}</p>
              </div>
              <button
                type="button"
                aria-label={isTakeOver ? undefined : t('notice.dismissNamed', { notice: title })}
                onClick={() => {
                  focusPending.current = true;
                  item.control.run();
                }}
              >
                {isTakeOver ? t('notice.takeOver') : t('notice.dismiss')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
