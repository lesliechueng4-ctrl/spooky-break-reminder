// Engine (design: "Runtime Loop", "Schedule Continuity", "Platform Adapters"; Requirements 1.6-1.8,
// 13.4-13.6, 14.1-14.8, 21.4, 21.5, 25.1, 25.3, 25.5, 25.7).
//
// The engine is the only module that applies Scheduler events to live state and the only module that
// writes the schedule to storage. Every input becomes `dispatch(event, atWall)`:
//
//   1. Measure: when `atWall` is not before the last evaluation, classify the gap since then
//      (`classifyGap`) and advance the schedule by its schedule time (`scheduleDelta`). An away
//      verdict advances through the gap and then resets the schedule.
//   2. Apply: a user intent or a page lifecycle event changes the state (`reduce`).
//   3. Commit: persist when an event happened, on a freeze, on a page hide, or every 30 s. Then
//      publish the derived view and the audio input to the store.
//
// An event stamped in the past (for example a hidden Ritual that timed out at `hiddenAt + 60 s`) is
// measured up to its own time and applied there. An event stamped before the last evaluation is
// applied at that evaluation instead, because the schedule has already moved past its time.
//
// Adapter errors (storage, audio, the store) are logged through `report` and never stop the engine.
// Errors from the core are programming errors, so they propagate.
import { setLanguage } from '../i18n';
import { classifyGap, type GapInput } from '../core/continuity';
import { nextHold, shouldPresentJumpScare, type HoldInput } from '../core/jumpScare';
import { RITUAL_HIDDEN_LIMIT_MS } from '../core/rituals/common';
import { defaultSettings, type Language, type Settings } from '../core/settings';
import type { Meta, PersistedSchedule } from '../core/persistence';
import {
  derive,
  initialState,
  reduce,
  schedulerConfigFor,
  type DomainEvent,
  type ScheduleView,
  type SchedulerConfig,
  type SchedulerEvent,
  type SchedulerState,
} from '../core/scheduler';
import {
  HEARTBEAT_MS,
  MINUTE_MS,
  naturalBreakWallMs,
  scheduleDelta,
  speedFor,
  type Speed,
} from '../core/time';
import type { Clock } from '../platform/clock';
import { createIdleMonitor, type IdleEvent, type IdleMonitor } from '../platform/idle';
import type { LifecycleAdapter, LifecycleEvent } from '../platform/lifecycle';
import type { StorageNotice, AppStorage } from '../platform/storage';
import type { Ticker } from '../platform/ticker';
import type { AppStore } from './store';

/**
 * A wall-clock reading and a monotonic reading taken at the same moment can differ by at most this
 * much. Within it, the pair is used as evidence of suspend (Requirement 14.5).
 */
export const PRESENT_TOLERANCE_MS = 1_000;

/** Browser lock names for the single-active-tab rule (Requirement 22). Demo_Mode uses its own lock. */
export const ACTIVE_LOCK_NAME = { normal: 'sbr-active', demo: 'sbr-active-demo' } as const;

/** Demo_Mode is on only for the exact value `demo=1` (Requirement 25.1). */
export function isDemoSearch(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1';
}

/**
 * Scheduler events that a UI or an adapter may send. `advance` is internal to the engine. Settings
 * changes go through `updateSettings`, and `awayEnded` is produced by the engine when it classifies
 * a gap as an Away_Period.
 */
export type EngineIntent = Exclude<SchedulerEvent, { type: 'advance' | 'configChanged' | 'awayEnded' }>;

/** Everything the engine accepts. */
export type EngineEvent =
  | EngineIntent
  /** A wake-up from the ticker, a visibility change or a pageshow: re-evaluate the schedule now. */
  | { readonly type: 'wake' }
  /**
   * The App document or the Ghost_Window became visible. It re-evaluates the schedule like `wake`, and it is a
   * 6.6 moment that can release a held Jump_Scare.
   */
  | { readonly type: 'surfaceShown' }
  /**
   * The Idle_Monitor reports an idle user or a locked screen. `sinceWall` is the start of the absence, back-dated
   * for an idle user (Requirement 13.3). Only the Idle_Monitor sends this event.
   */
  | { readonly type: 'awayOpened'; readonly sinceWall: number }
  /** The Idle_Monitor reports an active user with an unlocked screen. It closes the open Away_Period (Requirement 13.3). */
  | { readonly type: 'awayClosed' }
  /**
   * The presenting document of the running Ritual became hidden at the event's wall-clock time. The Ritual ends
   * without completion 60 s later, at that deadline (Requirement 7.8). Sent by the Ritual session.
   */
  | { readonly type: 'ritualHidden' }
  /** The presenting document of the running Ritual became visible again. The hidden deadline no longer applies. */
  | { readonly type: 'ritualVisible' }
  /** `pagehide`: persist now (Requirement 14.1). */
  | { readonly type: 'pageHidden' }
  /** Chromium `freeze`: record `frozenAtWall` and persist before the page freezes (Requirement 14.6). */
  | { readonly type: 'pageFrozen' }
  /** Chromium `resume`: the page is running again after a freeze. */
  | { readonly type: 'pageResumed' };

/** Engine events plus the settings change, which the engine applies itself. */
type RunEvent = EngineEvent | Extract<SchedulerEvent, { type: 'configChanged' }>;

type Intervention = GapInput['intervention'];

export interface EngineDeps {
  readonly store: AppStore;
  readonly storage: AppStorage;
  readonly clock: Clock;
  readonly ticker: Ticker;
  readonly lifecycle: LifecycleAdapter;
  /**
   * The Idle_Monitor for away detection (Requirements 13.1-13.9). Defaults to a monitor without the Idle Detection
   * API, which reports 'none' and never starts, so a host without the feature needs no setup.
   */
  readonly idle?: IdleMonitor;
  readonly demo: boolean;
  /**
   * True while the App document is visible. The Jump_Scare policy reads it (Requirement 6.5). Defaults to true,
   * which suits a host without a document, such as the tests.
   */
  readonly appVisible?: () => boolean;
  /** Language for a first start, when nothing is stored yet (Requirement 20.2). */
  readonly defaultLanguage: Language;
  /**
   * Called once per commit with the view published by the previous commit, the view of this commit and the
   * domain events that the commit produced. The App passes the Notifier here (Requirements 15.2, 22.2). An error
   * from the hook is reported and does not stop the engine.
   */
  readonly onCommit?: (prev: ScheduleView, next: ScheduleView, events: readonly DomainEvent[]) => void;
  /** Receives every adapter error. Defaults to console.error. */
  readonly report?: (message: string, error: unknown) => void;
}

export interface Engine {
  /**
   * Loads the stored state, evaluates the gap since the last run, and starts the wake-ups. Idempotent while running.
   * After `stop`, it loads the stored state again (Requirement 22.2).
   */
  start(): void;
  /** Persists the state and stops the wake-ups and lifecycle listeners. Idempotent. */
  stop(): void;
  /** Applies one input at wall-clock time `atWall` (default: now). */
  dispatch(event: EngineEvent, atWall?: number): void;
  /** Stores the new Settings and applies the schedule change (Requirements 1.9, 21.3). */
  updateSettings(next: Settings, atWall?: number): void;
  /** Deletes every App record, then restores the default Settings and a fresh Work_Interval (Requirement 21.6). */
  eraseAll(atWall?: number): void;
  /**
   * Sets the onboarded flag and starts the first Work_Interval at `atWall` (Requirement 24.6). Idempotent:
   * a call after onboarding is complete changes nothing.
   */
  completeOnboarding(atWall?: number): void;
}

/** Maps a storage notice to the "changes will not be saved" notice (Requirement 21.5). */
export function storageReporter(store: AppStore): (notice: StorageNotice) => void {
  return () => store.addNotice('notSaved');
}

const defaultReport = (message: string, error: unknown): void => {
  console.error(`[engine] ${message}`, error);
};

/** The fresh schedule used on a first start, and after a reset: a new Work_Interval in Calm_State. */
function freshSchedule(atWall: number): PersistedSchedule {
  return {
    state: { phase: { kind: 'calm', workElapsedMs: 0, pause: null }, breakCounter: 0 },
    lastAliveWall: atWall,
    frozenAtWall: null,
    awayOpenSinceWall: null,
  };
}

export function createEngine(deps: EngineDeps): Engine {
  const { store, storage, clock, ticker, lifecycle, demo } = deps;
  const report = deps.report ?? defaultReport;
  const speed: Speed = speedFor(demo);
  const appVisible = deps.appVisible ?? (() => true);
  const idle = deps.idle ?? createIdleMonitor({ clock, detector: undefined });

  let started = false;
  /** How many times `start` has run in this page. A tab can stop and start again when it loses or regains the lock (Requirement 22.2). */
  let startCount = 0;
  let settings: Settings = defaultSettings(deps.defaultLanguage);
  let config: SchedulerConfig = schedulerConfigFor(settings, speed);
  let state: SchedulerState = initialState();
  let lastAliveWall = 0;
  /** Monotonic reading of the last evaluation in this page session. Null after a reload or a past-stamped event. */
  let lastAliveMono: number | null = null;
  let frozenAtWall: number | null = null;
  /**
   * Wall-clock time at which the presenting document of the running Ritual became hidden, or null. The Ritual's
   * deadline is this value plus RITUAL_HIDDEN_LIMIT_MS (Requirement 7.8). Engine memory only: a Ritual is never stored.
   */
  let ritualHiddenWall: number | null = null;
  let awayOpenSinceWall: number | null = null;
  let lastPersistWall: number | null = null;
  let unsubscribers: Array<() => void> = [];
  /**
   * The Jump_Scare hold (design: "Core: Policies"). Engine memory only: a reload shows the App document again,
   * which is a 6.6 moment anyway.
   */
  let jumpHeld = false;
  /** Domain events produced since the last commit. `step` appends to it, and the next commit hands them to `onCommit`. */
  let pendingEvents: DomainEvent[] = [];
  /** The view that the last commit published. It is the `prev` of the next commit. */
  let committedView: ScheduleView = derive(state, config);

  function guardedWrite(label: string, write: () => void): void {
    try {
      write();
    } catch (error) {
      report(`could not write ${label}`, error);
    }
  }

  /** Applies one scheduler event and returns the events it produced. The events also wait for the next commit. */
  function step(event: SchedulerEvent): DomainEvent[] {
    const result = reduce(state, event, config);
    state = result.state;
    pendingEvents.push(...result.events);
    return result.events;
  }

  /** Accounts for the gap between the last evaluation and `atWall` (Requirements 14.2-14.8). */
  function measure(
    atWall: number,
    intervention: Intervention,
    monoNow: number,
    present: boolean,
  ): DomainEvent[] {
    const naturalBreak = naturalBreakWallMs(settings, demo);
    const gapMonoMs = present && lastAliveMono !== null ? monoNow - lastAliveMono : null;
    const verdict = classifyGap({
      gapWallMs: atWall - lastAliveWall,
      gapMonoMs,
      naturalBreakWallMs: naturalBreak,
      intervention,
      awayOpen: awayOpenSinceWall !== null,
    });

    // Backward steps and the other verdicts add the same schedule time: scheduleDelta clamps a
    // backward step to zero (Requirement 14.7).
    const events = step({ type: 'advance', dt: scheduleDelta(lastAliveWall, atWall, speed) });
    if (verdict.kind === 'away') {
      events.push(...step({ type: 'awayEnded', awayWallMs: verdict.awayWallMs, naturalBreakWallMs: naturalBreak }));
      store.setWelcomeBack({ awayMinutes: Math.floor(verdict.awayWallMs / MINUTE_MS) });
    }
    return events;
  }

  /**
   * Records the start of an open Away_Period. The engine keeps the earliest start it has seen, so a later report
   * with an earlier start moves it back (Requirement 13.3).
   */
  function openAway(sinceWall: number): void {
    awayOpenSinceWall = awayOpenSinceWall === null ? sinceWall : Math.min(awayOpenSinceWall, sinceWall);
  }

  /**
   * Closes the open Away_Period at `atWall`. Its length runs from the recorded start. An absence of at least
   * Natural_Break_Duration counts as an Away_Exorcism or a Calm reset, and the welcome-back message names it
   * (Requirements 13.4-13.6). A shorter one changes nothing. Returns the events that the reset produced.
   */
  function closeAway(atWall: number): DomainEvent[] {
    if (awayOpenSinceWall === null) return [];
    const awayWallMs = Math.max(0, atWall - awayOpenSinceWall);
    const naturalBreak = naturalBreakWallMs(settings, demo);
    awayOpenSinceWall = null;
    const events = step({ type: 'awayEnded', awayWallMs, naturalBreakWallMs: naturalBreak });
    if (awayWallMs >= naturalBreak) {
      store.setWelcomeBack({ awayMinutes: Math.floor(awayWallMs / MINUTE_MS) });
    }
    return events;
  }

  /** Turns the Idle_Monitor on, or reports that it cannot start. Turning it on never prompts (Requirement 13.2). */
  function startIdle(): void {
    void idle
      .start()
      .then((ok) => {
        // The permission can be revoked after the toggle was turned on, or the browser may lack the API. Either way the
        // feature turns off. A revoked permission also shows the site-settings instructions (Requirement 13.9).
        if (ok || !started || !settings.awayDetection) return;
        if (idle.support === 'available') store.addNotice('awayDenied');
        updateSettingsNow({ ...settings, awayDetection: false }, clock.wall());
      })
      .catch((error: unknown) => report('could not start away detection', error));
  }

  /** Reacts to a report from the Idle_Monitor. The store flag drives the audio gain (Requirement 13.7). */
  function onIdle(event: IdleEvent): void {
    store.setIdle(event.type === 'awayOpened');
    if (event.type === 'awayOpened') {
      handle({ type: 'awayOpened', sinceWall: event.sinceWall }, event.atWall);
    } else {
      handle({ type: 'awayClosed' }, event.atWall);
    }
  }

  function heartbeatDue(atWall: number): boolean {
    if (lastPersistWall === null) return true;
    // A backward step makes the difference negative, so the heartbeat fires again at once.
    return atWall < lastPersistWall || atWall - lastPersistWall >= HEARTBEAT_MS;
  }

  function persistSchedule(atWall: number): void {
    const record: PersistedSchedule = {
      state: { phase: state.phase, breakCounter: state.breakCounter },
      lastAliveWall,
      frozenAtWall,
      awayOpenSinceWall,
    };
    guardedWrite('schedule', () => storage.writeRecord('schedule', record));
    lastPersistWall = atWall;
  }

  /**
   * Pushes the derived view to the store and the audio input to the Audio_Engine, then hands the commit to
   * `onCommit` with the previous view and the events since the last commit.
   */
  function publish(): void {
    const view = derive(state, config);
    const prev = committedView;
    const events = pendingEvents;
    pendingEvents = [];
    committedView = view;
    store.setView(view);
    try {
      store.audio.update({
        view,
        volume: settings.masterVolume / 100,
        muted: settings.muted,
        idle: store.idle.peek(),
        activeInstance: store.activeInstance.peek(),
        nightmare: settings.nightmare,
      });
    } catch (error) {
      report('audio update failed', error);
    }
    try {
      deps.onCommit?.(prev, view, events);
    } catch (error) {
      report('commit hook failed', error);
    }
  }

  /**
   * The single path for every input. `intervention` describes the gap that ends at `atWall`, and
   * `forcePersist` makes the commit write the schedule even when nothing else requires it.
   */
  function runEvent(event: RunEvent, atWall: number, intervention: Intervention, forcePersist: boolean): void {
    // A hidden Ritual ends at its deadline, whatever the time of this evaluation (Requirement 7.8). The end is applied
    // first and stamped at the deadline, so the time after it accrues as overdue. Without this, a late wake-up would
    // skip the time between the deadline and the wake-up, because the Ritual freezes overdue time while it runs.
    if (ritualHiddenWall !== null && state.ritual !== null && ritualHiddenWall + RITUAL_HIDDEN_LIMIT_MS <= atWall) {
      const deadline = ritualHiddenWall + RITUAL_HIDDEN_LIMIT_MS;
      ritualHiddenWall = null;
      runEvent({ type: 'ritualEnded' }, deadline, 'none', false);
    }

    const monoNow = clock.mono();
    const present = Math.abs(atWall - clock.wall()) <= PRESENT_TOLERANCE_MS;
    let persist = forcePersist;
    let transitioned = false;
    // Inputs to the Jump_Scare hold (Requirements 6.6, 6.11), applied once this commit's state is known.
    const holdInputs: HoldInput[] = [];

    // A past-stamped event before the last evaluation is applied at that evaluation (see the header).
    if (event.type === 'wake' || event.type === 'surfaceShown' || atWall >= lastAliveWall) {
      const events = measure(atWall, intervention, monoNow, present);
      transitioned = events.length > 0;
      if (events.some((e) => e.type === 'snoozeEnded')) holdInputs.push('snoozeEnded');
      lastAliveWall = atWall;
      lastAliveMono = present ? monoNow : null;
    }

    switch (event.type) {
      case 'wake':
        break;
      case 'surfaceShown':
        holdInputs.push('surfaceShown');
        break;
      case 'ritualHidden':
        // The first hidden report of a Ritual sets the deadline. A repeated report cannot move it later.
        if (state.ritual !== null && ritualHiddenWall === null) ritualHiddenWall = atWall;
        break;
      case 'ritualVisible':
        ritualHiddenWall = null;
        break;
      case 'pageHidden':
        persist = true;
        break;
      case 'pageFrozen':
        frozenAtWall = atWall;
        persist = true;
        break;
      case 'pageResumed':
        frozenAtWall = null;
        persist = true;
        break;
      case 'awayOpened':
        openAway(event.sinceWall);
        persist = true;
        break;
      case 'awayClosed':
        closeAway(atWall);
        persist = true;
        break;
      default:
        // Every user intent and settings change persists. Intents are rare, so this costs little.
        step(event);
        if (event.type === 'ritualEnded') holdInputs.push('ritualEnded');
        persist = true;
        break;
    }

    // A deadline belongs to a running Ritual only. Any end, by the user or by the engine, clears it.
    if (state.ritual === null) ritualHiddenWall = null;

    settleHold(holdInputs);
    const presented = presentJumpScareIfDue();
    // The presented flag is stored with the Haunting, so it survives a reload (Requirement 6.7).
    if (presented) persist = true;

    if (transitioned || persist || heartbeatDue(atWall)) persistSchedule(atWall);
    publish();
    // The scream plays after publish, so the Audio_Engine already has the Nightmare_Mode setting (Requirement 5.2).
    if (presented) playScream();
  }

  /** Applies the Jump_Scare hold inputs of one commit (Requirements 6.6, 6.10, 6.11). */
  function settleHold(inputs: readonly HoldInput[]): void {
    const view = derive(state, config);
    for (const input of inputs) jumpHeld = nextHold(jumpHeld, input, view);
    // A Haunting that has ended leaves no Jump_Scare pending (the Haunting ends, Requirement 6.6).
    if (view.phase === 'calm') jumpHeld = nextHold(jumpHeld, 'hauntingEnded', view);
  }

  /** Presents the Jump_Scare when the policy allows it (Requirements 6.5-6.7). Returns true when it did. */
  function presentJumpScareIfDue(): boolean {
    const due = shouldPresentJumpScare(derive(state, config), {
      nightmare: settings.nightmare,
      held: jumpHeld,
      appVisible: appVisible(),
      ghostVisible: store.ghostVisible.peek(),
      activeInstance: store.activeInstance.peek(),
    });
    if (!due) return false;
    step({ type: 'jumpScarePresented' });
    store.presentJumpScare();
    return true;
  }

  /** Plays the scream. An adapter error is reported, and the engine keeps running. */
  function playScream(): void {
    try {
      store.audio.playScream();
    } catch (error) {
      report('could not play the scream', error);
    }
  }

  /** The gap's intervention. Only a resume after a freeze carries one; startup sets its own. */
  function interventionFor(event: RunEvent): Intervention {
    return event.type === 'pageResumed' && frozenAtWall !== null ? 'frozen' : 'none';
  }

  function handle(event: RunEvent, atWall: number): void {
    runEvent(event, atWall, interventionFor(event), false);
  }

  /**
   * Reads the stored records. Invalid data loads the defaults, starts a new Work_Interval and raises
   * the reset notice (Requirement 21.4). A missing settings record gets the defaults without a notice.
   * The result says whether a reset happened, whether the schedule came from storage, and the schedule.
   */
  function restore(now: number): { reset: boolean; scheduleStored: boolean; schedule: PersistedSchedule } {
    const settingsRead = storage.readRecord('settings');
    const metaRead = storage.readRecord('meta');
    const scheduleRead = storage.readRecord('schedule');
    const invalid =
      settingsRead.status === 'invalid' || metaRead.status === 'invalid' || scheduleRead.status === 'invalid';

    if (invalid) {
      console.warn('[engine] stored data failed validation; loading defaults and starting a new Work_Interval');
      settings = defaultSettings(deps.defaultLanguage);
      const meta: Meta = { onboarded: false };
      guardedWrite('settings', () => storage.writeRecord('settings', settings));
      guardedWrite('meta', () => storage.writeRecord('meta', meta));
      store.setOnboarded(meta.onboarded);
      store.addNotice('reset');
      return { reset: true, scheduleStored: false, schedule: freshSchedule(now) };
    }

    if (settingsRead.status === 'ok') {
      settings = settingsRead.value;
    } else {
      settings = defaultSettings(deps.defaultLanguage);
      guardedWrite('settings', () => storage.writeRecord('settings', settings));
    }
    store.setOnboarded(metaRead.status === 'ok' ? metaRead.value.onboarded : false);

    if (scheduleRead.status === 'ok') {
      return { reset: false, scheduleStored: true, schedule: scheduleRead.value };
    }
    return { reset: false, scheduleStored: false, schedule: freshSchedule(now) };
  }

  function start(): void {
    if (started) return;
    started = true;

    const now = clock.wall();
    const restored = restore(now);
    const { schedule } = restored;

    // The browser's startup signal describes this page load, so only the first start reads it. A later start has no
    // intervention of its own: the gap since the last stop is the hand-over between tabs (Requirement 22.2).
    const browserIntervention: Intervention = startCount === 0 ? lifecycle.startupIntervention : 'none';
    // A freeze that was never resumed (the page was discarded, or closed while frozen) is an Intervention_Signal.
    const startupIntervention: Intervention =
      browserIntervention !== 'none' ? browserIntervention : schedule.frozenAtWall !== null ? 'frozen' : 'none';
    startCount += 1;

    config = schedulerConfigFor(settings, speed);
    state = { phase: schedule.state.phase, breakCounter: schedule.state.breakCounter, ritual: null };
    lastAliveWall = schedule.lastAliveWall;
    lastAliveMono = null; // a new page session has no monotonic reference to the old one
    awayOpenSinceWall = schedule.awayOpenSinceWall;
    // With away detection off, nothing can close an open absence, so it is dropped. The gap rules of Requirement 14 apply
    // to the gap instead (Requirement 13.10).
    if (!settings.awayDetection) awayOpenSinceWall = null;
    frozenAtWall = null;
    ritualHiddenWall = null;

    store.setSettings(settings);
    setLanguage(settings.language);

    const persistRequired = restored.reset || !restored.scheduleStored || schedule.frozenAtWall !== null;
    runEvent({ type: 'wake' }, now, startupIntervention, persistRequired);

    unsubscribers = [
      ticker.onTick((atWall) => handle({ type: 'wake' }, atWall)),
      lifecycle.subscribe(onLifecycle),
      idle.subscribe(onIdle),
    ];
    ticker.start();
    if (settings.awayDetection) startIdle();
  }

  function onLifecycle(event: LifecycleEvent): void {
    switch (event.type) {
      case 'visibility':
        // A document that becomes visible is a 6.6 moment for the Jump_Scare hold (Requirement 6.6).
        handle(event.visible ? { type: 'surfaceShown' } : { type: 'wake' }, event.atWall);
        break;
      case 'pageshow':
        handle({ type: 'wake' }, event.atWall);
        break;
      case 'pagehide':
        handle({ type: 'pageHidden' }, event.atWall);
        break;
      case 'freeze':
        handle({ type: 'pageFrozen' }, event.atWall);
        break;
      case 'resume':
        handle({ type: 'pageResumed' }, event.atWall);
        break;
    }
  }

  /** Stores the new Settings and applies the schedule change. The caller checks that the engine has started. */
  function updateSettingsNow(next: Settings, atWall: number): void {
    // Settle the schedule up to now with the old settings, then apply the new config (Requirement 1.9).
    runEvent({ type: 'wake' }, atWall, 'none', false);
    const previousLanguage = settings.language;
    const wasNightmare = settings.nightmare;
    const wasAwayDetection = settings.awayDetection;
    settings = next;
    config = schedulerConfigFor(next, speed);
    // Turning Nightmare_Mode on never presents a Jump_Scare on the spot. The hold is set before the commit
    // below, so the configChanged commit finds it (Requirement 6.11). Turning it off cancels a pending one (6.10).
    if (!next.nightmare) {
      jumpHeld = false;
    } else if (!wasNightmare) {
      jumpHeld = nextHold(jumpHeld, 'nightmareEnabled', derive(state, config));
    }
    // Away detection (Requirements 13.2, 13.3, 13.10). Turning it off ends an open Away_Period at this moment, because
    // the user changed the setting and is at the desk. The gap rules then apply again.
    if (wasAwayDetection && !next.awayDetection) {
      idle.stop();
      store.setIdle(false);
      closeAway(atWall);
    } else if (!wasAwayDetection && next.awayDetection) {
      startIdle();
    }
    store.setSettings(next);
    guardedWrite('settings', () => storage.writeRecord('settings', next));
    if (next.language !== previousLanguage) setLanguage(next.language);
    runEvent({ type: 'configChanged', config }, atWall, 'none', false);
  }

  return {
    start,

    stop() {
      if (!started) return;
      ticker.stop();
      idle.stop();
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
      runEvent({ type: 'pageHidden' }, clock.wall(), 'none', true);
      started = false;
    },

    dispatch(event, atWall = clock.wall()) {
      if (!started) {
        report('dispatch called before start', event);
        return;
      }
      handle(event, atWall);
    },

    updateSettings(next, atWall = clock.wall()) {
      if (!started) {
        report('updateSettings called before start', next);
        return;
      }
      updateSettingsNow(next, atWall);
    },

    completeOnboarding(atWall = clock.wall()) {
      if (!started) {
        report('completeOnboarding called before start', null);
        return;
      }
      if (store.onboarded.peek()) return;

      // Settle the schedule to this moment first, so the time before Start is not measured again later.
      runEvent({ type: 'wake' }, atWall, 'none', false);
      // Start the first Work_Interval from the Start press (Requirement 24.6).
      state = initialState();
      awayOpenSinceWall = null;
      store.setOnboarded(true);
      const meta: Meta = { onboarded: true };
      guardedWrite('meta', () => storage.writeRecord('meta', meta));
      persistSchedule(atWall);
      publish();
    },

    eraseAll(atWall = clock.wall()) {
      if (!started) {
        report('eraseAll called before start', null);
        return;
      }
      // Settle the schedule to now first, so the last persisted write is the one that erase removes.
      runEvent({ type: 'wake' }, atWall, 'none', false);
      storage.eraseAll();

      // Start over the way a first start does: defaults, Calm_State, no Away_Period, and no signed-in data.
      settings = defaultSettings(deps.defaultLanguage);
      config = schedulerConfigFor(settings, speed);
      state = initialState();
      awayOpenSinceWall = null;
      frozenAtWall = null;
      jumpHeld = false;
      store.setSettings(settings);
      store.setOnboarded(false);
      store.setWelcomeBack(null);
      store.dismissNotice('reset');
      setLanguage(settings.language);
      guardedWrite('settings', () => storage.writeRecord('settings', settings));
      persistSchedule(atWall);
      publish();
    },
  };
}
