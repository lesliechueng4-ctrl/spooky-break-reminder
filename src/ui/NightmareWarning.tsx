// NightmareWarning: the content warning for Nightmare_Mode (Requirements 6.2-6.4, 6.11; design, "UI Components").
//
// A native <dialog> opened with showModal(), following the RitualDialog pattern:
// - Focus: the dialog moves focus to Cancel when it opens, the safe choice, and traps Tab inside itself. When it
//   closes, focus returns to the control that had it before the warning opened.
// - Escape: the native cancel event is prevented and reported as `onCancel`, so the dialog closes only when the
//   parent sets `open` to false.
//
// Only "I understand, enable" reports `onConfirm`. Cancel and Escape report `onCancel`, so Nightmare_Mode stays off
// (6.4). The component never calls the engine. The parent turns the mode on (src/app/main.tsx), and the engine holds
// any Jump_Scare for a level-5 Haunting until a 6.6 moment (6.11).
import type { ReadonlySignal } from '@preact/signals';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';

/** Elements that Tab can reach inside the dialog. Disabled controls and tabindex -1 are skipped. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Id of the App's main element, the fallback focus target when the control that opened the warning is gone. */
const MAIN_ID = 'sbr-main';

export interface NightmareWarningProps {
  /** True while the warning is shown. The parent sets it when the user asks to turn the mode on (6.2). */
  readonly open: ReadonlySignal<boolean>;
  /** The user chose "I understand, enable" (6.3). */
  readonly onConfirm: () => void;
  /** The user cancelled or pressed Escape (6.4). Nightmare_Mode stays off. */
  readonly onCancel: () => void;
}

/** Keeps Tab and Shift+Tab inside the dialog by wrapping at both ends (Requirement 19.5). */
function trapTab(event: KeyboardEvent, dialog: HTMLDialogElement): void {
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = dialog.ownerDocument.activeElement;
  const inside = active !== null && dialog.contains(active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

/** Focuses the element that had focus before the warning, or the main element when that element is gone. */
function restoreFocus(previous: HTMLElement | null, doc: Document): void {
  if (previous !== null && previous.isConnected && !(previous as HTMLButtonElement).disabled) {
    previous.focus();
    return;
  }
  doc.getElementById(MAIN_ID)?.focus();
}

export function NightmareWarning({ open, onConfirm, onCancel }: NightmareWarningProps) {
  const isOpen = open.value;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (isOpen && !dialog.open) {
      // `instanceof HTMLElement` is false across documents, so the focus method is checked instead.
      const active = dialog.ownerDocument.activeElement;
      returnRef.current =
        active !== null && typeof (active as HTMLElement).focus === 'function' ? (active as HTMLElement) : null;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
      restoreFocus(returnRef.current, dialog.ownerDocument);
      returnRef.current = null;
    }
  }, [isOpen]);

  const onKeyDown = (event: KeyboardEvent): void => {
    const dialog = dialogRef.current;
    if (event.key === 'Tab' && dialog !== null) trapTab(event, dialog);
  };

  const onNativeCancel = (event: Event): void => {
    // Escape would close a native dialog on its own. The parent closes it through `open`, so the prevented close is
    // reported as a cancel (6.4).
    event.preventDefault();
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      class="sbr-warning"
      aria-labelledby="sbr-nightmare-title"
      aria-describedby="sbr-nightmare-body"
      onCancel={onNativeCancel}
      onKeyDown={onKeyDown}
    >
      <h2 id="sbr-nightmare-title" class="sbr-warning-title">
        {t('nightmare.warning.title')}
      </h2>
      <p id="sbr-nightmare-body">{t('nightmare.warning.body')}</p>
      <p class="sbr-note">{t('nightmare.warning.note')}</p>
      <div class="sbr-button-row">
        <button ref={cancelRef} type="button" data-autofocus onClick={() => onCancel()}>
          {t('nightmare.warning.cancel')}
        </button>
        <button type="button" onClick={() => onConfirm()}>
          {t('nightmare.warning.confirm')}
        </button>
      </div>
    </dialog>
  );
}
