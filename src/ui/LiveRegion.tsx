// LiveRegion (design: "UI Components"; Requirement 19.7).
//
// A polite live region that carries the Haunting_Level and the due Ritual to assistive technology. The text is
// built by `announcementFor`, which leaves out the overdue minutes. The text therefore changes only when the
// level, the due Ritual or the phase changes, so a screen reader does not announce it every minute. The region
// is visually hidden, so it adds no text to the layout.
import type { ScheduleView, RitualKind } from '../core/scheduler';
import { t } from '../i18n';
import { BREAK_KEY, RITUAL_KEY } from './labels';

/** Names the offered Rituals in the active language, for example "Breathing Ritual or Stretch Ritual". */
export function ritualList(kinds: readonly RitualKind[]): string {
  const names = kinds.map((kind) => t(RITUAL_KEY[kind]));
  if (names.length === 2) {
    return t('ritual.or', { first: names[0], second: names[1] });
  }
  return names.join(', ');
}

/**
 * The polite live-region text for a view (Requirement 19.7). It names the Haunting_Level and the due
 * Ritual, but not the minutes. The text therefore changes only when the level or the due break changes,
 * and a screen reader does not announce it every minute.
 */
export function announcementFor(view: ScheduleView): string {
  if (view.phase === 'calm') {
    return t('live.calm', { breakType: t(BREAK_KEY[view.nextBreak]) });
  }
  return t('live.haunting', { level: view.level, rituals: ritualList(view.offered) });
}

export interface LiveRegionProps {
  /** The text to announce. Pass the output of `announcementFor`. */
  readonly text: string;
}

export function LiveRegion({ text }: LiveRegionProps) {
  return (
    <div class="sbr-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
