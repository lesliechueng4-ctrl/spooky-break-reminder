// Ghost_Window controller (design: "Runtime Loop" and "Platform Adapters"; Requirements 11.2, 17.1-17.6, 20.4,
// 22.2).
//
// The controller keeps one Ghost_Window open at a time. It opens the window through the adapter from a click,
// renders GhostPanel into it, mounts the window's own HauntLayer, and keeps the window's lang, title, Reduced_Motion
// and hidden state in step with the App. A Ritual started in the window is presented by the window: the Ritual
// session gets the window's visibility and timers, so the countdown keeps running there (Requirement 17.5).
//
// Only the Active_Instance may open the window or keep it open (Requirement 22.2). The controller reads the
// schedule and calls the engine only through `dispatch`, as the Main_Screen does. Adapter errors are logged here and
// never reach the engine.
import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import { render } from 'preact';
import type { RitualKind } from '../core/scheduler';
import { language, t } from '../i18n';
import type { GhostWindowAdapter, GhostWindowHandle } from '../platform/pip';
import { documentVisibility } from '../platform/ticker';
import { GhostPanel } from '../ui/GhostPanel';
import type { Engine } from './engine';
import { mountHauntLayer } from './hauntMount';
import type { RitualPresenter, RitualSession } from './ritualSession';
import type { AppStore } from './store';

export interface GhostWindowController {
  /** True when the browser offers Document Picture-in-Picture (Requirement 17.1). */
  readonly supported: boolean;
  /** True when the control can open the window: the API exists and this tab is the Active_Instance. */
  readonly available: ReadonlySignal<boolean>;
  /** True while the window is open. */
  readonly isOpen: ReadonlySignal<boolean>;
  /** Opens the window. Call it from a click handler (Requirement 17.2). Does nothing when unavailable or open. */
  openFromGesture(): void;
  /** Closes the window, if it is open. */
  close(): void;
}

export interface GhostWindowDeps {
  readonly adapter: GhostWindowAdapter;
  readonly store: AppStore;
  readonly ritual: RitualSession;
  readonly engine: Pick<Engine, 'dispatch'>;
  readonly reducedMotion: ReadonlySignal<boolean>;
  /** Seed of the crack layout and fog textures. The window uses the same seed as the App document. */
  readonly seed: number;
  /** Receives adapter errors. Defaults to `console.warn`. */
  readonly log?: (message: string, error: unknown) => void;
}

/** Everything that belongs to one open window. Disposing it removes the window's effects and its listeners. */
interface Session {
  readonly handle: GhostWindowHandle;
  readonly presenter: RitualPresenter;
  /** Cleanup functions, in the order they were created. */
  readonly disposers: Array<() => void>;
}

const defaultLog = (message: string, error: unknown): void => {
  console.warn(`[ghost] ${message}`, error);
};

export function createGhostWindowController(deps: GhostWindowDeps): GhostWindowController {
  const { adapter, store, ritual, engine, reducedMotion, seed } = deps;
  const log = deps.log ?? defaultLog;

  const supported = adapter.support() === 'available';
  const available = computed(() => supported && store.activeInstance.value);
  const isOpen = signal(false);
  // The window shows the Ritual that runs in it, and no other.
  const ghostRitual = computed(() => (ritual.presenter.value === 'ghost' ? ritual.snapshot.value : null));

  let session: Session | null = null;
  let opening = false;

  /** Ends the Ritual that runs in the window, then removes the window's content and effects. */
  function teardown(): void {
    const current = session;
    if (current === null) return;
    session = null;
    isOpen.value = false;
    store.setGhostVisible(false);

    // A Ritual that runs in the window ends without completion when the window closes (Requirement 17.5).
    ritual.endPresentedBy('ghost');

    for (const dispose of [...current.disposers].reverse()) {
      try {
        dispose();
      } catch (error) {
        log('could not remove part of the Ghost_Window', error);
      }
    }
  }

  /** Renders the panel and the effects into a newly opened window. */
  function attach(handle: GhostWindowHandle): Session {
    const doc = handle.doc;
    const disposers: Array<() => void> = [];

    // The window's language, title and motion follow the App (Requirements 17.2, 20.1, 20.4, 19.1-19.3).
    disposers.push(
      effect(() => {
        doc.documentElement.lang = language.value;
        doc.title = t('app.name');
      }),
    );
    disposers.push(
      effect(() => {
        doc.documentElement.dataset.reducedMotion = String(reducedMotion.value);
      }),
    );

    // Hidden state pauses the window's CSS animations, as it does in the App document (Requirement 19.10).
    const visibility = documentVisibility(doc);
    const syncHidden = (): void => {
      doc.documentElement.dataset.hidden = String(visibility.isHidden());
    };
    // The window's visibility feeds the Jump_Scare policy (Requirement 6.5). A window that becomes visible is a
    // 6.6 moment, so the engine gets `surfaceShown`. The flag is set before the dispatch, so the commit reads it.
    const syncVisibility = (): void => {
      syncHidden();
      const visible = !visibility.isHidden();
      store.setGhostVisible(visible);
      engine.dispatch({ type: visible ? 'surfaceShown' : 'wake' });
    };
    disposers.push(visibility.subscribe(syncVisibility));

    // The window's own HauntLayer, with the same schedule as the Main_Screen (Requirement 17.4).
    disposers.push(
      mountHauntLayer({ store, doc, reducedMotion, ritualProgress: ritual.progress, seed }),
    );
    // Reported once the layer exists, so a Jump_Scare that this report presents also plays in the window.
    syncVisibility();

    // A Ritual started here is presented by this window, so its visibility and timers are this window's.
    const win = handle.win;
    const presenter: RitualPresenter = {
      surface: 'ghost',
      visibility,
      timers: {
        setTimeout: (callback, ms) => win.setTimeout(callback, ms),
        clearTimeout: (handleId) => win.clearTimeout(handleId as number),
      },
    };

    const startRitual = (kind: RitualKind): void => {
      const origin = store.view.peek().phase === 'haunting' ? 'haunting' : 'early';
      ritual.start(kind, origin, presenter);
    };

    render(
      <GhostPanel
        view={store.view}
        whisper={store.whisper}
        ritual={ghostRitual}
        onStartRitual={startRitual}
        onSnooze={() => engine.dispatch({ type: 'snooze' })}
        onRitualIntent={(intent) => ritual.input(intent)}
      />,
      handle.root,
    );
    disposers.push(() => render(null, handle.root));

    return { handle, presenter, disposers };
  }

  function openFromGesture(): void {
    if (!available.peek() || session !== null || opening) return;
    opening = true;

    // The adapter starts the browser request inside this call, so the click's user gesture is kept.
    adapter
      .open(teardown)
      .then((handle) => {
        opening = false;
        if (handle === null) return;

        // Only the Active_Instance keeps a window (Requirement 22.2). A tab that lost that role closes it.
        if (!store.activeInstance.peek()) {
          handle.close();
          return;
        }

        try {
          session = attach(handle);
          isOpen.value = true;
        } catch (error) {
          log('could not render the Ghost_Window', error);
          handle.close();
        }
      })
      .catch((error: unknown) => {
        opening = false;
        log('could not open the Ghost_Window', error);
      });
  }

  function close(): void {
    session?.handle.close();
  }

  // Losing the Active_Instance role closes the window (Requirement 22.2). Reading the signal here subscribes the effect.
  effect(() => {
    if (!store.activeInstance.value) close();
  });

  return { supported, available, isOpen, openFromGesture, close };
}
