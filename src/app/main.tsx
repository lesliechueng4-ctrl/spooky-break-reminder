// Entry point and composition root (design: "Source Layout"; Requirements 2.1-2.6, 7.1-7.9, 16.1, 19.1,
// 19.10, 20.4, 25.1, 25.6). This file creates the adapters, the store, the engine and the Ritual session,
// mounts the HauntLayer and the Main_Screen, and then requests the instance lock, which starts the engine. The components only call the
// callbacks given here. The callbacks below are the only calls to engine.dispatch from the UI.
import { computed, effect, signal } from '@preact/signals';
import { render } from 'preact';
import { createRng } from '../core/rng';
import { derive, initialState, schedulerConfigFor } from '../core/scheduler';
import { speedFor } from '../core/time';
import { tabStatus } from '../core/tabStatus';
import { detectLanguage, language, setLanguage, t } from '../i18n';
import { createAudioEngine } from '../platform/audio/engine';
import { systemClock } from '../platform/clock';
import { createIdleMonitor, detectIdleDetector } from '../platform/idle';
import { createInstanceLock, detectLockManager } from '../platform/instanceLock';
import { createLifecycle } from '../platform/lifecycle';
import { effectiveReducedMotion, watchReducedMotion } from '../platform/media';
import { createNotifier } from '../platform/notifier';
import { createGhostWindowAdapter } from '../platform/pip';
import { openStorage } from '../platform/storage';
import { createTabAdapter, faviconUrl } from '../platform/tab';
import { createTicker, documentVisibility } from '../platform/ticker';
import { MainScreen } from '../ui/MainScreen';
import { Notices } from '../ui/Notices';
import { NightmareWarning } from '../ui/NightmareWarning';
import { Onboarding } from '../ui/Onboarding';
import { Settings } from '../ui/Settings';
import { installTheme } from '../ui/theme';
import '../ui/styles.css';
import { ACTIVE_LOCK_NAME, createEngine, isDemoSearch, storageReporter } from './engine';
import { createGhostWindowController } from './ghostWindow';
import { mountHauntLayer } from './hauntMount';
import { createRitualSession } from './ritualSession';
import { createAppStore } from './store';

/** Seed of the crack layout and fog textures. A fixed value keeps the layout the same on every load. */
const HAUNT_SEED = 1;

/** Reloads the App at the same address with `demo=1` added or removed. Other query parameters stay (Requirement 25.2). */
function reloadInDemoMode(enabled: boolean): void {
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set('demo', '1');
  } else {
    url.searchParams.delete('demo');
  }
  window.location.assign(url.toString());
}

function boot(root: HTMLElement): void {
  const demo = isDemoSearch(window.location.search);
  const defaultLanguage = detectLanguage(navigator.language);

  const audio = createAudioEngine({ rng: createRng(systemClock.wall()) });
  const store = createAppStore({ audio, demo, defaultLanguage });
  // Until the instance lock answers, this tab is not known to be the Active_Instance. The engine does not run, and
  // the App renders nothing but notices (Requirement 22.2).
  store.setActiveInstance(false);
  const storage = openStorage({ mode: demo ? 'demo' : 'normal', report: storageReporter(store) });
  // A tab that is not the Active_Instance never starts the engine, so it reads the saved language here. Its take-over
  // notice then uses the language the user chose (Requirement 20.5). Invalid data is left to the Active_Instance.
  const savedSettings = storage.readRecord('settings');
  if (savedSettings.status === 'ok') setLanguage(savedSettings.value.language);
  const visibility = documentVisibility(document);
  const ticker = createTicker({ clock: systemClock, visibility });
  const lifecycle = createLifecycle({ doc: document, win: window, clock: systemClock });
  const idle = createIdleMonitor({ clock: systemClock, detector: detectIdleDetector() });
  // Notifications (Requirements 15.1-15.6, 22.2). The Notifier applies the notifyPolicy decisions and decides
  // nothing on its own. The controls only report the toggle. The permission request starts in the click
  // handler below, so it is a user gesture (Requirements 15.1, 24.4). It is created before the engine, because the
  // engine calls it at every commit.
  const notifier = createNotifier({
    doc: document,
    win: window,
    isActiveInstance: () => store.activeInstance.peek(),
    isEnabled: () => store.settings.peek().notifications,
    translate: t,
    iconUrl: (id) => faviconUrl(import.meta.env.BASE_URL, id),
    onOffer: () => {
      // The window is already focused. Move focus to the Ritual controls so the offered Ritual is in view (Requirement 15.4).
      document
        .getElementById('sbr-haunt-controls')
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    },
  });
  const engine = createEngine({
    store,
    storage,
    clock: systemClock,
    ticker,
    lifecycle,
    idle,
    demo,
    defaultLanguage,
    appVisible: () => !visibility.isHidden(),
    // Every commit goes to the Notifier, which shows a Haunting notification only when this tab is the
    // Active_Instance and the App document is hidden (Requirements 15.2, 22.2).
    onCommit: (prev, next, events) => notifier.handleCommit(prev, next, events),
  });

  // The Ritual session reports to the engine. A Ritual is started, completed or ended only through these
  // calls, so the schedule stays the single source of truth (Requirements 2.5, 2.6, 7.5, 7.8).
  const ritual = createRitualSession({
    clock: systemClock,
    visibility,
    audio: store.audio,
    onStarted: (kind, origin) => engine.dispatch({ type: 'ritualStarted', kind, origin }),
    onFinished: ({ status, atWall }) =>
      engine.dispatch(status === 'completed' ? { type: 'ritualCompleted' } : { type: 'ritualEnded' }, atWall),
    // The engine owns the 60 s hidden deadline, so it learns when the presenting document hides and shows (Requirement 7.8).
    onHidden: (atWall) => engine.dispatch({ type: 'ritualHidden' }, atWall),
    onVisible: (atWall) => engine.dispatch({ type: 'ritualVisible' }, atWall),
  });

  // Reduced_Motion: the Settings_Panel value wins, and "system" follows the operating system (19.1, 19.2).
  const motion = watchReducedMotion(window);
  const systemReducedMotion = signal(motion.matches());
  motion.subscribe((matches) => {
    systemReducedMotion.value = matches;
  });
  const reducedMotion = computed(() => effectiveReducedMotion(store.settings.value.reducedMotion, systemReducedMotion.value));

  // Document state. The lang attribute follows the active language (20.4). The data attributes drive the
  // CSS for Reduced_Motion and for a hidden document (19.10).
  effect(() => {
    document.documentElement.lang = language.value;
  });
  // The tab title and favicon follow the schedule and the language (16.1-16.4). The adapter writes only
  // the values that changed, and it catches its own errors, so the engine never waits on it.
  const tab = createTabAdapter({ doc: document, baseUrl: import.meta.env.BASE_URL });
  effect(() => {
    tab.update(tabStatus(store.view.value, language.value));
  });
  effect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion.value);
  });
  const syncHidden = (): void => {
    document.documentElement.dataset.hidden = String(visibility.isHidden());
  };
  syncHidden();
  visibility.subscribe(syncHidden);

  const notifyStatus = signal(notifier.status());
  visibility.subscribe(() => {
    // The user may change the site permission while the App is open. Re-reading it when the document changes keeps the status current.
    notifyStatus.value = notifier.status();
  });
  // Away detection (Requirements 13.1, 13.2, 13.9). The permission request starts in the click handler, which
  // calls this function synchronously, so it is a user gesture. The setting turns on only when the browser grants
  // the permission. A denial leaves the toggle off and raises the notice with the site-settings instructions.
  const setAwayDetection = (enable: boolean): void => {
    if (!enable) {
      engine.updateSettings({ ...store.settings.peek(), awayDetection: false });
      return;
    }
    void idle.requestPermission().then((result) => {
      if (result === 'granted') engine.updateSettings({ ...store.settings.peek(), awayDetection: true });
      else if (result === 'denied') store.addNotice('awayDenied');
    });
  };
  const notificationsOn = computed(() => store.settings.value.notifications);
  const setNotifications = (enable: boolean): void => {
    if (!enable) {
      engine.updateSettings({ ...store.settings.peek(), notifications: false });
      return;
    }
    // The browser request starts synchronously in this call. The setting turns on only when the permission is granted.
    void notifier.requestPermission().then((status) => {
      notifyStatus.value = status;
      if (status === 'granted') engine.updateSettings({ ...store.settings.peek(), notifications: true });
    });
  };

  // The engine can end a Ritual by itself, for example with an Away_Exorcism (Requirement 13.5). The dialog
  // then closes without a second report, because the schedule no longer has a Ritual to end.
  effect(() => {
    if (store.view.value.ritual === null) ritual.cancel();
  });

  // Single active tab (Requirements 22.1-22.4). The tab that holds the lock runs the engine. A tab that loses it stops
  // the engine, clears what it shows, and shows the take-over notice. The engine starts again when the lock is granted,
  // and it loads the schedule that the previous holder stored.
  const instanceLock = createInstanceLock({
    name: demo ? ACTIVE_LOCK_NAME.demo : ACTIVE_LOCK_NAME.normal,
    locks: detectLockManager(),
    log: (message, error) => console.warn(`[instance] ${message}`, error),
  });
  instanceLock.subscribe((state) => {
    if (state === 'pending') return;
    if (state === 'active') {
      store.setActiveInstance(true);
      store.dismissNotice('instanceInactive');
      engine.start();
      return;
    }
    store.setActiveInstance(false);
    ritual.cancel();
    // The engine persists the schedule and stops its wake-ups and listeners. Settings and audio then see the inactive state.
    engine.stop();
    // The Main_Screen and the HauntLayer read the view. This reset clears the effects of the last Haunting from this tab.
    store.setView(derive(initialState(), schedulerConfigFor(store.settings.peek(), speedFor(demo))));
    store.addNotice('instanceInactive');
  });

  mountHauntLayer({ store, doc: document, reducedMotion, ritualProgress: ritual.progress, seed: HAUNT_SEED });

  // The Ghost_Window (Requirements 17.1-17.7). It opens from the Main_Screen control in the Active_Instance only.
  // A Ritual started there is presented there, so this document shows only the Ritual that it presents itself.
  const ghostWindow = createGhostWindowController({
    adapter: createGhostWindowAdapter({
      doc: document,
      win: window,
      baseUrl: import.meta.env.BASE_URL,
      lang: () => language.peek(),
    }),
    store,
    ritual,
    engine,
    reducedMotion,
    seed: HAUNT_SEED,
  });
  const appRitual = computed(() => (ritual.presenter.value === 'app' ? ritual.snapshot.value : null));

  const nightmare = computed(() => store.settings.value.nightmare);
  // Opens the Nightmare_Mode content warning. The mode turns on only from its confirm handler (Requirements 6.2-6.4).
  const nightmareWarningOpen = signal(false);
  const whisper = store.whisper;
  const soundStatus = computed(() => store.audio.state.value.status);

  // The Start press is the user gesture that unlocks audio (Requirements 18.1, 24.7). Unlock runs first, inside
  // the click, and the engine then sets the onboarded flag and starts the first Work_Interval (Requirement 24.6).
  const startFirstWorkInterval = (): void => {
    void store.audio.unlock();
    engine.completeOnboarding();
  };

  // The Onboarding_Screen shows until the onboarded flag is set, and then the Main_Screen takes its place
  // (Requirement 24.1). Reading the signal in this component subscribes it, so the swap needs no reload.
  const Entry = () =>
    store.onboarded.value ? (
      <MainScreen
        view={store.view}
        nightmare={nightmare}
        demo={demo}
        whisper={whisper}
        soundStatus={soundStatus}
        onEnableSound={() => {
          // Audio starts only from a user gesture (Requirement 18.1). The click is that gesture.
          void store.audio.unlock();
        }}
        // The controls only report intents. The engine applies them through its own dispatch.
        onStartRitual={(kind) => {
          // The Ritual is early in Calm_State and part of the Haunting otherwise (Requirements 2.5, 7.1).
          ritual.start(kind, store.view.peek().phase === 'haunting' ? 'haunting' : 'early');
        }}
        ritual={appRitual}
        onRitualIntent={(intent) => ritual.input(intent)}
        onSnooze={() => engine.dispatch({ type: 'snooze' })}
        onPause={(durationMs) => engine.dispatch({ type: 'pause', durationMs })}
        onResume={() => engine.dispatch({ type: 'resume' })}
        ghostAvailable={ghostWindow.available}
        ghostOpen={ghostWindow.isOpen}
        onOpenGhost={() => ghostWindow.openFromGesture()}
      />
    ) : (
      <Onboarding
        demo={demo}
        onToggleDemo={reloadInDemoMode}
        onStart={startFirstWorkInterval}
        notificationStatus={notifyStatus}
        notificationsEnabled={notificationsOn}
        onNotificationToggle={setNotifications}
      />
    );

  // Only the Active_Instance renders the App. An inactive tab shows its notices, including the take-over notice, and
  // nothing else (Requirement 22.2). Reading the signal here subscribes this component to the change.
  const Shell = () => {
    if (!store.activeInstance.value) return null;
    return (
      <>
        <Entry />
        {/* Settings go through the engine (Requirements 1.9, 21.3). The panel never calls the engine itself. */}
        <Settings
          settings={store.settings}
          demo={demo}
          onUpdate={(next) => engine.updateSettings(next)}
          onToggleDemo={reloadInDemoMode}
          onEraseAll={() => engine.eraseAll()}
          notificationStatus={notifyStatus}
          onNotificationToggle={setNotifications}
          ghostWindowSupported={ghostWindow.supported}
          awaySupported={idle.support === 'available'}
          onAwayDetectionToggle={setAwayDetection}
          onNightmareRequest={() => {
            nightmareWarningOpen.value = true;
          }}
        />
        <NightmareWarning
          open={nightmareWarningOpen}
          onConfirm={() => {
            // Only this confirmation turns Nightmare_Mode on (Requirement 6.3). The engine holds a Jump_Scare that
            // this change would otherwise present on the spot (Requirement 6.11).
            nightmareWarningOpen.value = false;
            engine.updateSettings({ ...store.settings.peek(), nightmare: true });
          }}
          onCancel={() => {
            // Cancel and Escape keep Nightmare_Mode off (Requirement 6.4).
            nightmareWarningOpen.value = false;
          }}
        />
      </>
    );
  };

  render(
    <>
      {/* Notices are dismissed through the store setters. They are rendered above the Main_Screen (Requirements 13.6, 21.4, 21.5, 22.1). */}
      <Notices
        notices={store.notices}
        welcomeBack={store.welcomeBack}
        onDismiss={(kind) => store.dismissNotice(kind)}
        onDismissWelcomeBack={() => store.setWelcomeBack(null)}
        onTakeOver={() => instanceLock.takeOver()}
      />
      <Shell />
    </>,
    root,
  );

  instanceLock.start();
}

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app mount element in index.html');
}
installTheme(document);
boot(root);
