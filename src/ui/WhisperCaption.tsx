// Whisper caption, shared by the Main_Screen and the Ghost_Window (Requirements 4.13, 4.14).
//
// Both documents read the same audio signal, so they show the same text in the same language for the same
// duration. The caption sits in an opaque .sbr-panel, so the effects behind it never lower its contrast
// (Requirements 4.10, 19.6). It is aria-hidden: the LiveRegion announces the level and the due Ritual instead.
// Every text goes through t(). The component reads signals and writes nothing.
import type { ReadonlySignal } from '@preact/signals';
import type { RitualKind, ScheduleView } from '../core/scheduler';
import { t, type MessageKey } from '../i18n';

/** A Whisper that is audible now. `id` differs for each Whisper, so the caption can rotate between Rituals. */
export interface WhisperLine {
  readonly id: number;
}

const WHISPER_KEY: Readonly<Record<RitualKind, MessageKey>> = {
  eye: 'whisper.eye',
  breathing: 'whisper.breathing',
  stretch: 'whisper.stretch',
};

/**
 * The caption for the audible Whisper, or null when none plays (Requirements 4.13, 4.14). A Whisper names
 * one Ritual that the Haunting offers. A Long_Break alternates between its two Rituals from one Whisper to
 * the next.
 */
export function captionFor(view: ScheduleView, whisper: WhisperLine | null): string | null {
  if (whisper === null || view.phase !== 'haunting' || view.offered.length === 0) {
    return null;
  }
  const kind = view.offered[whisper.id % view.offered.length];
  return t(WHISPER_KEY[kind]);
}

export interface WhisperCaptionProps {
  readonly view: ReadonlySignal<ScheduleView>;
  readonly whisper: ReadonlySignal<WhisperLine | null>;
}

/** Renders the caption while a Whisper is audible, and nothing otherwise. */
export function WhisperCaption({ view, whisper }: WhisperCaptionProps) {
  const caption = captionFor(view.value, whisper.value);
  if (caption === null) return null;

  return (
    <p class="sbr-panel sbr-caption" aria-hidden="true">
      {caption}
    </p>
  );
}
