// Tab title and favicon for the schedule (Requirements 2.2, 16.1-16.5). Pure core: no DOM, no
// clock, no timers. The platform tab adapter (src/platform/tab.ts) writes the returned values.

import { translateIn } from '../i18n';
import type { HauntingLevel, ScheduleView } from './scheduler';
import { MINUTE_MS } from './time';
import type { Language } from './settings';

/** Favicon ids; each one names an SVG under public/icons/. */
export type FaviconId = 'candle' | 'level-1' | 'level-2' | 'level-3' | 'level-4' | 'level-5';

export interface TabStatus {
  readonly title: string;
  readonly favicon: FaviconId;
}

const SECOND_MS = 1_000;

const FAVICON_BY_LEVEL: Record<HauntingLevel, FaviconId> = {
  1: 'level-1',
  2: 'level-2',
  3: 'level-3',
  4: 'level-4',
  5: 'level-5',
};

/**
 * Formats a remaining time as mm:ss. Partial seconds round up, so the display reaches 00:00 only
 * when the time is actually over. Negative input is treated as zero.
 */
export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / SECOND_MS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Title and favicon for the current schedule view.
 *
 * - Calm: the remaining minutes until the Due_Time, rounded up (16.1); candle favicon (16.4).
 * - Haunting: the Haunting_Level and the Overdue_Duration in whole minutes, rounded down (16.2);
 *   the favicon of the level (16.3).
 * - A Snooze or a Pause adds a "Snoozed" or "Paused" indicator to the title (16.5).
 *
 * The favicon is always the value for the state. The browser decides whether it applies the
 * change (Requirements 16.3 and 16.4).
 */
export function tabStatus(view: ScheduleView, lang: Language): TabStatus {
  if (view.phase === 'calm') {
    const minutes = Math.ceil(view.remainingMs / MINUTE_MS);
    const title = translateIn(lang, 'tab.calm', { minutes });
    const indicator = view.pause === null ? null : 'tab.paused';
    return { title: withIndicator(title, indicator, lang), favicon: 'candle' };
  }

  const minutes = Math.floor(view.overdueMs / MINUTE_MS);
  const title = translateIn(lang, 'tab.haunting', { level: view.level, minutes });
  const indicator = view.snoozeRemainingMs > 0 ? 'tab.snoozed' : null;
  return { title: withIndicator(title, indicator, lang), favicon: FAVICON_BY_LEVEL[view.level] };
}

function withIndicator(
  title: string,
  indicator: 'tab.snoozed' | 'tab.paused' | null,
  lang: Language,
): string {
  if (indicator === null) {
    return title;
  }
  return translateIn(lang, 'tab.withState', { state: translateIn(lang, indicator), title });
}
