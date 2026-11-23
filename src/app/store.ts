// App store: the Preact signals that the UI and the output adapters read (design: "Runtime Loop",
// step 4; Requirements 13.6, 21.4, 21.5, 22.2, 25.6). The engine (engine.ts) is the only writer of
// the schedule view and the stored settings. The UI writes the Settings_Panel values through the
// engine, not through these setters.
//
// The Audio_Engine is wrapped here: the store mirrors its state into a signal and exposes the calls
// the rest of the App needs. Audio is unlocked only from a user gesture (Requirement 18.1).

import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { derive, initialState, schedulerConfigFor, type ScheduleView } from '../core/scheduler';
import { speedFor } from '../core/time';
import { defaultSettings, type Language, type Settings } from '../core/settings';
import type { AudioEngine, AudioInput, AudioState, WhisperCue } from '../platform/audio/engine';
import type { CuePhase } from '../platform/audio/synth';

/**
 * Notices that the App shows until the user dismisses them (Requirements 21.4, 21.5, 13.9). `instanceInactive` is
 * the take-over notice (Requirement 22.1). It has a take-over control instead of a dismiss control, and the
 * instance lock clears it when this tab becomes the Active_Instance.
 */
export type NoticeKind = 'reset' | 'notSaved' | 'awayDenied' | 'instanceInactive';

/** Length of the last Away_Period, in whole minutes, for the welcome-back message (Requirement 13.6). */
export interface WelcomeBack {
  readonly awayMinutes: number;
}

/** The audio calls and state that the App uses. Calls go straight to the Audio_Engine. */
export interface AudioPort {
  readonly state: ReadonlySignal<AudioState>;
  unlock(): Promise<void>;
  update(input: AudioInput): void;
  playChime(): boolean;
  playCue(phase: CuePhase): boolean;
  playScream(): boolean;
}

export interface AppStore {
  /** True when the App runs in Demo_Mode (Requirement 25.1). */
  readonly demo: boolean;
  readonly settings: ReadonlySignal<Settings>;
  readonly view: ReadonlySignal<ScheduleView>;
  readonly onboarded: ReadonlySignal<boolean>;
  readonly notices: ReadonlySignal<readonly NoticeKind[]>;
  readonly welcomeBack: ReadonlySignal<WelcomeBack | null>;
  /** False when another App tab is the Active_Instance (Requirement 22.2). Set by the instance lock. */
  readonly activeInstance: ReadonlySignal<boolean>;
  /** True while the Idle_Monitor reports an idle user or a locked screen (Requirement 13.7). */
  readonly idle: ReadonlySignal<boolean>;
  /** True while the Ghost_Window is open and visible. The Jump_Scare policy reads it (Requirement 6.5). */
  readonly ghostVisible: ReadonlySignal<boolean>;
  /**
   * Number of Jump_Scares presented so far. Each presentation increments it once, and every HauntLayer
   * plays its Jump_Scare timeline when the count changes (Requirements 6.5-6.8).
   */
  readonly jumpScareCount: ReadonlySignal<number>;
  readonly audio: AudioPort;
  /**
   * The Whisper that is audible now, or null. The Main_Screen and the Ghost_Window both render its caption, so the two
   * documents show the same text for the same duration (Requirements 4.13, 4.14).
   */
  readonly whisper: ReadonlySignal<WhisperCue | null>;

  setSettings(next: Settings): void;
  setView(next: ScheduleView): void;
  setOnboarded(next: boolean): void;
  addNotice(kind: NoticeKind): void;
  dismissNotice(kind: NoticeKind): void;
  setWelcomeBack(next: WelcomeBack | null): void;
  setActiveInstance(next: boolean): void;
  setIdle(next: boolean): void;
  setGhostVisible(next: boolean): void;
  /** Called by the engine when it presents a Jump_Scare. The scream is played separately through `audio`. */
  presentJumpScare(): void;
}

export interface AppStoreDeps {
  readonly audio: AudioEngine;
  readonly demo: boolean;
  readonly defaultLanguage: Language;
}

/** Creates the store with the defaults. The engine replaces them with the stored values on start. */
export function createAppStore(deps: AppStoreDeps): AppStore {
  const settings = signal<Settings>(defaultSettings(deps.defaultLanguage));
  const view = signal<ScheduleView>(derive(initialState(), schedulerConfigFor(settings.peek(), speedFor(deps.demo))));
  const onboarded = signal(false);
  const notices = signal<readonly NoticeKind[]>([]);
  const welcomeBack = signal<WelcomeBack | null>(null);
  const activeInstance = signal(true);
  const idle = signal(false);
  const ghostVisible = signal(false);
  const jumpScareCount = signal(0);

  const audioState = signal<AudioState>(deps.audio.getState());
  deps.audio.subscribe((next) => {
    audioState.value = next;
  });
  const whisper = computed(() => audioState.value.whisper);

  const audio: AudioPort = {
    state: audioState,
    unlock: () => deps.audio.unlock(),
    update: (input) => deps.audio.update(input),
    playChime: () => deps.audio.playChime(),
    playCue: (phase) => deps.audio.playCue(phase),
    playScream: () => deps.audio.playScream(),
  };

  return {
    demo: deps.demo,
    settings,
    view,
    onboarded,
    notices,
    welcomeBack,
    activeInstance,
    idle,
    ghostVisible,
    jumpScareCount,
    audio,
    whisper,

    setSettings(next) {
      settings.value = next;
    },

    setView(next) {
      // The view is rebuilt on every wake-up. Writing only on a real change keeps the UI from re-rendering each second.
      if (JSON.stringify(view.peek()) !== JSON.stringify(next)) view.value = next;
    },

    setOnboarded(next) {
      onboarded.value = next;
    },

    addNotice(kind) {
      if (!notices.peek().includes(kind)) notices.value = [...notices.peek(), kind];
    },

    dismissNotice(kind) {
      notices.value = notices.peek().filter((current) => current !== kind);
    },

    setWelcomeBack(next) {
      welcomeBack.value = next;
    },

    setActiveInstance(next) {
      activeInstance.value = next;
    },

    setIdle(next) {
      idle.value = next;
    },

    setGhostVisible(next) {
      ghostVisible.value = next;
    },

    presentJumpScare() {
      jumpScareCount.value = jumpScareCount.peek() + 1;
    },
  };
}
