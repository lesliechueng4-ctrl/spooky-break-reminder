// RitualDialog (Requirements 7.3, 7.5, 7.9, 19.5, 19.6; design, "UI Components").
//
// A native <dialog> opened with showModal(). The dialog is the only surface of a running Ritual:
// - Focus: the dialog moves focus to its first element marked data-autofocus when it opens, traps Tab
//   inside itself, and gives focus back to the element that had it before the Ritual started.
// - Escape: the native cancel event is prevented and sent as a `key` intent, so the Ritual ends from
//   anywhere (7.5) and the dialog closes only when the schedule says the Ritual is over.
// - Eye_Ritual surface: a pointer press or a key on the dialog outside the Abandon button is an intent.
//   Presses on the Abandon button are not, so Tab, Enter and Space there keep their meaning (8.4).
// The dialog reports intents through `onIntent` and never calls the engine.
import type { ReadonlySignal } from '@preact/signals';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { RITUAL_KEY } from '../labels';
import { BreathingRitual } from './BreathingRitual';
import { EyeRitual } from './EyeRitual';
import { StretchRitual } from './StretchRitual';
import type { RitualIntent, RitualSnapshot } from './types';

/** Elements that Tab can reach inside the dialog. Disabled controls and tabindex -1 are skipped. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Id of the App's main element, the fallback focus target when the element that started the Ritual is gone. */
const MAIN_ID = 'sbr-main';

export interface RitualDialogProps {
  readonly snapshot: ReadonlySignal<RitualSnapshot | null>;
  readonly onIntent: (intent: RitualIntent) => void;
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
  // The dialog may live in the Ghost_Window document, so focus is read from its own document.
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

/** Focuses the element that had focus before the Ritual, or the main element of its document when it is gone. */
function restoreFocus(previous: HTMLElement | null, doc: Document): void {
  if (previous !== null && previous.isConnected && !(previous as HTMLButtonElement).disabled) {
    previous.focus();
    return;
  }
  doc.getElementById(MAIN_ID)?.focus();
}

export function RitualDialog({ snapshot, onIntent }: RitualDialogProps) {
  const current = snapshot.value;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abandonRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const open = current !== null;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      // `instanceof HTMLElement` is false for elements of another window, so the focus method is checked instead.
      const active = dialog.ownerDocument.activeElement;
      returnRef.current = active !== null && typeof (active as HTMLElement).focus === 'function' ? (active as HTMLElement) : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocus(returnRef.current, dialog.ownerDocument);
      returnRef.current = null;
    }
  }, [open]);

  // The check is by containment, not `instanceof Node`, so it also holds for targets in the Ghost_Window.
  const fromAbandon = (target: EventTarget | null): boolean =>
    abandonRef.current !== null && target !== null && abandonRef.current.contains(target as Node);

  const onKeyDown = (event: KeyboardEvent): void => {
    const dialog = dialogRef.current;
    if (event.key === 'Tab' && dialog !== null) trapTab(event, dialog);
    if (current?.kind !== 'eye' || event.key === 'Escape' || fromAbandon(event.target)) return;
    onIntent({ type: 'key', key: event.key });
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (current?.kind !== 'eye' || fromAbandon(event.target)) return;
    onIntent({ type: 'press' });
  };

  const onCancel = (event: Event): void => {
    // Escape would close a native dialog. The Ritual decides when it ends, so the close is prevented.
    event.preventDefault();
    onIntent({ type: 'key', key: 'Escape' });
  };

  return (
    <dialog
      ref={dialogRef}
      class={current === null ? 'sbr-ritual' : `sbr-ritual sbr-ritual--${current.kind}`}
      aria-labelledby="sbr-ritual-title"
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      {current !== null && (
        <>
          <h2 id="sbr-ritual-title" class={current.kind === 'eye' ? 'sbr-sr-only' : 'sbr-ritual-title'}>
            {t(RITUAL_KEY[current.kind])}
          </h2>
          {current.kind !== 'eye' && (
            <div class="sbr-ritual-progress-row">
              <progress class="sbr-ritual-progress" max={1} value={current.outcome.progress} aria-label={t('ritual.progress')} />
              <p class="sbr-ritual-note">
                {t('ritual.progressValue', { percent: Math.round(current.outcome.progress * 100) })}
              </p>
            </div>
          )}
          {current.kind === 'eye' && <EyeRitual state={current.state} />}
          {current.kind === 'breathing' && <BreathingRitual state={current.state} onIntent={onIntent} />}
          {current.kind === 'stretch' && <StretchRitual state={current.state} onIntent={onIntent} />}
          <div class="sbr-ritual-footer">
            <button ref={abandonRef} type="button" onClick={() => onIntent({ type: 'abandon' })}>
              {t('ritual.abandon')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
