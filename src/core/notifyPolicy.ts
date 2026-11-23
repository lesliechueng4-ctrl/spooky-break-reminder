// Notification policy (design: "Core: Policies"; Requirements 11.5, 12.4, 15.2, 15.5, 22.2).
// Pure core: no clock, no randomness source, no DOM, no timers. Given the schedule view before and
// after one commit, and the events that commit produced, it decides whether to show a Haunting
// notification and whether to close the open ones. The Notifier in src/platform makes the browser
// calls. The notice carries translation keys, never English text; the Notifier resolves them
// through t() in the active language.

import type { BreakType } from './persistence';
import type { DomainEvent, HauntingLevel, ScheduleView } from './scheduler';

/** Tag of every Haunting notification. A new notice with the same tag replaces the previous one (15.3). */
export const NOTIFICATION_TAG = 'sbr-haunting' as const;

/**
 * A Haunting notification. The text is not included: the Notifier looks up `titleKey` and
 * `bodyKey` through t(), and fills the body with the break name (from `breakKey`), the level and
 * the overdue minutes.
 */
export interface HauntNotice {
  readonly tag: typeof NOTIFICATION_TAG;
  readonly titleKey: 'notice.haunting.title';
  readonly bodyKey: 'notice.haunting.body';
  /** Key of the break type name, substituted into the body. */
  readonly breakKey: 'notice.break.micro' | 'notice.break.long';
  readonly level: HauntingLevel;
  /** Overdue_Duration in whole minutes (Requirement 15.2). */
  readonly overdueWholeMin: number;
}

/** Settings and environment facts the policy needs. The caller reads them, the policy does not. */
export interface NotifyContext {
  readonly permission: 'granted' | 'denied' | 'default';
  /** The user turned notifications on in the Settings_Panel or Onboarding_Screen (Requirement 15.1). */
  readonly enabled: boolean;
  /** The App document is hidden, so the user may not see the tab (Requirement 15.2). */
  readonly appHidden: boolean;
  /** This tab is the Active_Instance (Requirement 22.2). */
  readonly activeInstance: boolean;
}

export interface NotifyDecision {
  /** Present when this commit should show a Haunting notification. */
  readonly show?: HauntNotice;
  /** True when a Haunting ended in this commit, so every open Haunting notification closes (15.5). */
  readonly closeAll: boolean;
}

/**
 * Decides the notification effects of one commit.
 *
 * A notice is shown only when all of these hold: the permission is granted, notifications are
 * enabled, the App document is hidden and this tab is the Active_Instance. The triggers are a
 * Haunting start, a Snooze that runs out (`snoozeEnded`, which `advance` emits only when a Snooze
 * reaches its full length, so a Snooze ended by a Ritual sends nothing, Requirement 15.2), and the
 * Haunting_Level reaching 5. A Snooze or a Pause withholds the notice (Requirements 11.5, 12.4).
 *
 * At most one notice is returned per call. Every trigger in one commit shows the same text,
 * because the text is built from the state after the commit.
 *
 * `closeAll` is set on every transition from a Haunting to Calm_State, that is, a Haunting that
 * ends by Ritual_Exorcism or Away_Exorcism (Requirement 15.5). It does not depend on the context,
 * because closing an already-shown notification needs no permission and no visibility check.
 * When both fields are set, the Notifier closes the open notices first and then shows the new one.
 */
export function notificationFor(
  prev: ScheduleView,
  next: ScheduleView,
  events: readonly DomainEvent[],
  c: NotifyContext,
): NotifyDecision {
  const closeAll = endsHaunting(prev, next, events);
  if (!mayNotify(c)) return { closeAll };
  if (next.phase !== 'haunting') return { closeAll };
  if (!isHauntingTrigger(prev, next, events)) return { closeAll };
  if (withheld(next)) return { closeAll };
  return { show: noticeFor(next), closeAll };
}

function mayNotify(c: NotifyContext): boolean {
  return c.enabled && c.permission === 'granted' && c.appHidden && c.activeInstance;
}

/**
 * A Snooze withholds Haunting notifications (11.5). A Pause withholds all notifications (12.4),
 * and it exists only in Calm_State. A Haunting cannot start during a Pause (12.7), so no Haunting
 * notice can be due while a Pause is active.
 */
function withheld(next: Extract<ScheduleView, { phase: 'haunting' }>): boolean {
  return next.snoozeRemainingMs > 0;
}

function endsHaunting(prev: ScheduleView, next: ScheduleView, events: readonly DomainEvent[]): boolean {
  if (prev.phase !== 'haunting') return false;
  return next.phase === 'calm' || events.some(isExorcism);
}

function isExorcism(e: DomainEvent): boolean {
  return e.type === 'ritualExorcism' || e.type === 'awayExorcism';
}

/** Events that start a new Haunting or end the current one. They mark a boundary between Hauntings. */
function isHauntingBoundary(e: DomainEvent): boolean {
  return e.type === 'hauntingStarted' || isExorcism(e);
}

function isHauntingTrigger(
  prev: ScheduleView,
  next: Extract<ScheduleView, { phase: 'haunting' }>,
  events: readonly DomainEvent[],
): boolean {
  if (events.some((e) => e.type === 'hauntingStarted')) return true;
  if (events.some((e) => e.type === 'snoozeEnded')) return true;
  // Level 5 is reached only once per Haunting. A commit that ends one Haunting and starts another
  // must not treat the new Haunting's level 5 as a repeat of the old one.
  const alreadyAtFive =
    prev.phase === 'haunting' && prev.level === 5 && !events.some(isHauntingBoundary);
  return next.level === 5 && !alreadyAtFive;
}

function noticeFor(next: Extract<ScheduleView, { phase: 'haunting' }>): HauntNotice {
  return {
    tag: NOTIFICATION_TAG,
    titleKey: 'notice.haunting.title',
    bodyKey: 'notice.haunting.body',
    breakKey: breakKeyFor(next.breakType),
    level: next.level,
    overdueWholeMin: next.overdueWholeMin,
  };
}

function breakKeyFor(breakType: BreakType): 'notice.break.micro' | 'notice.break.long' {
  return breakType === 'long' ? 'notice.break.long' : 'notice.break.micro';
}
