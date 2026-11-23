// Notifier (design: "Platform Adapters"; Requirements 15.1-15.6, 22.2).
//
// This is the only module that calls the Notifications API. It decides nothing by itself. For each commit
// it builds the context, asks `notificationFor` (src/core/notifyPolicy.ts) for a decision, and applies it:
// close the open notices, then show the new one. A notice is shown only when the permission is granted, the
// notifications setting is on, the App document is hidden and this tab is the Active_Instance (15.2, 22.2).
//
// Permission is requested only through `requestPermission()`. The UI calls it from a click handler, so the
// request is a user gesture (15.1, 24.4). Every browser call is wrapped: a failure is logged and returned as
// a value, and it never throws into the engine (design: adapter errors do not stop the engine).
//
// This file imports from src/core only. The caller passes the text lookup and the icon URL, so the adapter
// does not import src/i18n or the other platform modules.
import type { DomainEvent, ScheduleView } from '../core/scheduler';
import { notificationFor, type HauntNotice, type NotifyContext } from '../core/notifyPolicy';
import type { FaviconId } from '../core/tabStatus';

/** What the page can tell about notifications. `unsupported` means the Notifications API is missing (15.6). */
export type NotifyStatus = 'unsupported' | 'default' | 'granted' | 'denied';

/** The part of a Notification object that this adapter uses. */
export interface NotificationLike {
  onclick: ((event: Event) => unknown) | null;
  close(): void;
}

/** The options that this adapter passes to the Notification constructor. */
export interface NotificationOptionsLike {
  readonly tag: string;
  readonly body: string;
  readonly icon: string;
}

/** The part of the Notification constructor that this adapter uses. */
export interface NotificationCtor {
  new (title: string, options: NotificationOptionsLike): NotificationLike;
  readonly permission: string;
  requestPermission(callback?: (permission: string) => void): Promise<string> | void;
}

/** Values for `{name}` placeholders in a message. */
export type NoticeParams = Readonly<Record<string, string | number>>;

/** The translation keys that a Haunting notice carries (see HauntNotice in src/core/notifyPolicy.ts). */
export type NoticeKey = HauntNotice['titleKey'] | HauntNotice['bodyKey'] | HauntNotice['breakKey'];

export interface NotifierOptions {
  /** The App document. Its visibility decides whether a notice may show (Requirement 15.2). */
  readonly doc: { readonly visibilityState: DocumentVisibilityState };
  /** The window. Clicking a notice brings it to the foreground (Requirement 15.4). */
  readonly win: { focus(): void };
  /** The Notification constructor. When omitted, the browser's global `Notification` is read at each call. */
  readonly Notification?: NotificationCtor | undefined;
  /** True when this tab is the Active_Instance (Requirement 22.2). */
  readonly isActiveInstance: () => boolean;
  /** True when the user turned notifications on in the Settings_Panel or the Onboarding_Screen (Requirement 15.1). */
  readonly isEnabled: () => boolean;
  /** Returns the text for a key in the active language. The App passes `t`. */
  readonly translate: (key: NoticeKey, params?: NoticeParams) => string;
  /** Returns the URL of the favicon for an id, under the App base path. */
  readonly iconUrl: (id: FaviconId) => string;
  /** Presents the offered Ritual after a click on a notice (Requirement 15.4). The tab is already focused. */
  readonly onOffer: (notice: HauntNotice) => void;
  /** Receives every adapter error. Defaults to console.warn. */
  readonly log?: (message: string, error: unknown) => void;
}

export interface Notifier {
  /** The current permission state. Reads the browser each time. */
  status(): NotifyStatus;
  /**
   * Asks the browser for the notification permission and resolves with the result. Call it only from a
   * click handler (Requirements 15.1, 24.4). The browser request starts synchronously inside this call.
   * Without the API it resolves with 'unsupported' and does not prompt.
   */
  requestPermission(): Promise<NotifyStatus>;
  /** Applies the notification policy to one commit: `prev` and `next` are the schedule views, `events` the commit's events. */
  handleCommit(prev: ScheduleView, next: ScheduleView, events: readonly DomainEvent[]): void;
  /** Closes every Haunting notification that this page displayed (Requirement 15.5). */
  closeAll(): void;
}

/** The favicon of each Haunting_Level. Index 0 is the candle, used outside a Haunting. */
const ICON_BY_LEVEL: readonly FaviconId[] = ['candle', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5'];

const defaultLog = (message: string, error: unknown): void => {
  console.warn(`[notifier] ${message}`, error);
};

function isPromise(value: unknown): value is Promise<string> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

/** Maps the raw permission string to a status. Only 'granted' and 'denied' are kept; anything else is 'default'. */
function toStatus(value: unknown): NotifyStatus {
  return value === 'granted' || value === 'denied' ? value : 'default';
}

/** The permission as the policy sees it. A missing API cannot show a notice, so it counts as 'default'. */
function policyPermission(status: NotifyStatus): NotifyContext['permission'] {
  return status === 'granted' || status === 'denied' ? status : 'default';
}

export function createNotifier(options: NotifierOptions): Notifier {
  const log = options.log ?? defaultLog;

  /** Notification objects this page created and has not closed. Closing them all covers Requirement 15.5. */
  const open = new Set<NotificationLike>();

  function resolveCtor(): NotificationCtor | undefined {
    if (options.Notification !== undefined) return options.Notification;
    return typeof Notification === 'function' ? (Notification as unknown as NotificationCtor) : undefined;
  }

  function statusOf(ctor: NotificationCtor | undefined): NotifyStatus {
    if (ctor === undefined) return 'unsupported';
    try {
      return toStatus(ctor.permission);
    } catch (error) {
      log('could not read the notification permission', error);
      return 'default';
    }
  }

  function closeOpen(): void {
    for (const notification of open) {
      try {
        notification.close();
      } catch (error) {
        log('could not close a notification', error);
      }
    }
    open.clear();
  }

  function onClick(notification: NotificationLike, notice: HauntNotice): void {
    try {
      options.win.focus();
      notification.close();
    } catch (error) {
      log('could not focus the App after a notification click', error);
    } finally {
      open.delete(notification);
    }

    try {
      options.onOffer(notice);
    } catch (error) {
      log('could not present the offered Ritual', error);
    }
  }

  function show(notice: HauntNotice): void {
    const ctor = resolveCtor();
    if (ctor === undefined) return;

    // The previous notice closes before the new one replaces it (Requirement 15.3).
    closeOpen();

    try {
      const title = options.translate(notice.titleKey);
      const body = options.translate(notice.bodyKey, {
        breakType: options.translate(notice.breakKey),
        level: notice.level,
        minutes: notice.overdueWholeMin,
      });
      const level = Math.min(ICON_BY_LEVEL.length - 1, Math.max(0, notice.level));
      const created = new ctor(title, { tag: notice.tag, body, icon: options.iconUrl(ICON_BY_LEVEL[level]) });
      created.onclick = () => onClick(created, notice);
      open.add(created);
    } catch (error) {
      log('could not show a notification', error);
    }
  }

  function requestPermission(): Promise<NotifyStatus> {
    const ctor = resolveCtor();
    if (ctor === undefined) return Promise.resolve('unsupported');

    // The browser request is made synchronously here, so it stays inside the caller's click handler.
    return new Promise<NotifyStatus>((resolve) => {
      const fallback = (error: unknown): void => {
        log('could not request the notification permission', error);
        resolve(statusOf(ctor));
      };
      try {
        const pending = ctor.requestPermission((permission) => resolve(toStatus(permission)));
        if (isPromise(pending)) {
          pending.then((permission) => resolve(toStatus(permission)), fallback);
        }
      } catch (error) {
        fallback(error);
      }
    });
  }

  return {
    status() {
      return statusOf(resolveCtor());
    },

    requestPermission,

    handleCommit(prev, next, events) {
      // The policy is pure core code, so its errors propagate. Only the browser calls below are guarded.
      const decision = notificationFor(prev, next, events, {
        permission: policyPermission(statusOf(resolveCtor())),
        enabled: options.isEnabled(),
        appHidden: options.doc.visibilityState === 'hidden',
        activeInstance: options.isActiveInstance(),
      });
      if (decision.closeAll) closeOpen();
      if (decision.show !== undefined) show(decision.show);
    },

    closeAll: closeOpen,
  };
}
