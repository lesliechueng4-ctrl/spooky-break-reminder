// Main_Screen (design: "UI Components"; Requirements 2.1-2.6, 3.5, 4.13, 4.14, 6.9, 19.7, 25.6).
//
// The screen receives signals from the app shell (src/app/main.tsx) and renders them. It does not import
// the engine, the store or a platform adapter (structure rule: src/ui imports src/core and src/i18n only).
// Every text goes through t(). Every text sits on an opaque .sbr-panel above the effect layer, so the
// veil and the fog never lower its contrast (Requirements 4.10, 19.6).
import type { ReadonlySignal } from '@preact/signals';
import { offeredRituals, type RitualKind, type ScheduleView } from '../core/scheduler';
import { formatClock } from '../core/tabStatus';
import { t } from '../i18n';
import { Candle } from './Candle';
import { HauntControls } from './HauntControls';
import { announcementFor, LiveRegion, ritualList } from './LiveRegion';
import { BREAK_KEY, RITUAL_KEY } from './labels';
import { PauseMenu } from './PauseMenu';
import { RitualDialog } from './rituals/RitualDialog';
import type { RitualIntent, RitualSnapshot } from './rituals/types';
import { WhisperCaption, type WhisperLine } from './WhisperCaption';

// The text helpers live in LiveRegion and the caption helper in WhisperCaption. They stay exported from here,
// where the Main_Screen tests import them.
export { announcementFor, ritualList } from './LiveRegion';
export { captionFor, type WhisperLine } from './WhisperCaption';

/** Sound state as the screen shows it. `idle` and `blocked` both offer the enable-sound control (Requirement 18.2). */
export type SoundStatus = 'idle' | 'running' | 'blocked' | 'unsupported';

export interface MainScreenProps {
  readonly view: ReadonlySignal<ScheduleView>;
  readonly nightmare: ReadonlySignal<boolean>;
  /** Demo_Mode shows the "Demo x60" badge (Requirement 25.6). */
  readonly demo: boolean;
  readonly whisper: ReadonlySignal<WhisperLine | null>;
  readonly soundStatus: ReadonlySignal<SoundStatus>;
  readonly onEnableSound: () => void;
  /**
   * Starts a Ritual: the Ritual offered for the next break from Calm_State (Requirements 2.4, 2.5), or a
   * Ritual of the Haunting (Requirements 7.1, 7.2). Without a handler the Ritual controls are disabled.
   */
  readonly onStartRitual?: (kind: RitualKind) => void;
  /** The Ritual on screen, or null. The Ritual dialog renders it (Requirements 7.3, 8.1, 9.2, 10.2). */
  readonly ritual: ReadonlySignal<RitualSnapshot | null>;
  /** Receives what the user does inside the Ritual dialog. */
  readonly onRitualIntent: (intent: RitualIntent) => void;
  /** Snoozes the Haunting (Requirement 11.2). Without a handler the Snooze button is disabled. */
  readonly onSnooze?: () => void;
  /** Starts a Pause for the given schedule milliseconds, or until resumed when null (Requirement 12.1). */
  readonly onPause?: (durationMs: number | null) => void;
  /** Ends the Pause (Requirement 12.6). */
  readonly onResume?: () => void;
  /**
   * True when the Ghost_Window control can open the window: the browser has Document Picture-in-Picture and this
   * tab is the Active_Instance (Requirements 17.1, 22.2). Without it the control is not rendered.
   */
  readonly ghostAvailable?: ReadonlySignal<boolean>;
  /** True while the Ghost_Window is open. The control is then disabled. */
  readonly ghostOpen?: ReadonlySignal<boolean>;
  /** Opens the Ghost_Window. It is called from the click, which is the user gesture (Requirement 17.2). */
  readonly onOpenGhost?: () => void;
}

type CalmView = Extract<ScheduleView, { phase: 'calm' }>;
type HauntView = Extract<ScheduleView, { phase: 'haunting' }>;

interface CalmStatusProps {
  readonly view: CalmView;
  /** True while a Ritual runs. The Ritual controls are then disabled. */
  readonly busy: boolean;
  readonly onStartRitual?: (kind: RitualKind) => void;
}

function CalmStatus({ view, busy, onStartRitual }: CalmStatusProps) {
  const disabled = busy || onStartRitual === undefined;

  return (
    <>
      <h2 id="sbr-status-heading">{t('calm.heading')}</h2>
      <p>{t('calm.timeLeft')}</p>
      <p class="sbr-countdown">{formatClock(view.remainingMs)}</p>
      <p>{t('calm.nextBreak', { breakType: t(BREAK_KEY[view.nextBreak]) })}</p>
      {view.nextBreak === 'micro' ? (
        <button type="button" disabled={disabled} onClick={() => onStartRitual?.('eye')}>
          {t('calm.earlyBreak')}
        </button>
      ) : (
        <>
          <p>{t('calm.earlyBreakChoose')}</p>
          <div class="sbr-button-row">
            {offeredRituals(view.nextBreak).map((kind) => (
              <button key={kind} type="button" disabled={disabled} onClick={() => onStartRitual?.(kind)}>
                {t('haunt.startRitual', { ritual: t(RITUAL_KEY[kind]) })}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function HauntStatus({ view }: { readonly view: HauntView }) {
  return (
    <>
      <h2 id="sbr-status-heading">{t('haunt.heading')}</h2>
      <p>{t('haunt.level', { level: view.level })}</p>
      <p class="sbr-overdue">{t('haunt.overdue', { minutes: view.overdueWholeMin })}</p>
      <p>{t('haunt.endsWith', { rituals: ritualList(view.offered) })}</p>
    </>
  );
}

export function MainScreen(props: MainScreenProps) {
  const view = props.view.value;
  const nightmare = props.nightmare.value;
  const sound = props.soundStatus.value;
  const showSoundControl = sound === 'idle' || sound === 'blocked';

  return (
    <main id="sbr-main" class="sbr-main" tabIndex={-1}>
      <header class="sbr-panel sbr-header">
        <h1 class="sbr-title">{t('app.name')}</h1>
        {(props.demo || nightmare) && (
          <ul class="sbr-badges">
            {props.demo && <li class="sbr-badge">{t('demo.badge')}</li>}
            {nightmare && <li class="sbr-badge">{t('nightmare.badge')}</li>}
          </ul>
        )}
      </header>

      <Candle lit={view.phase === 'calm'} fraction={view.phase === 'calm' ? view.candleFraction : 0} />

      <section class="sbr-panel sbr-status" aria-labelledby="sbr-status-heading">
        {view.phase === 'calm' ? (
          <CalmStatus view={view} busy={view.ritual !== null} onStartRitual={props.onStartRitual} />
        ) : (
          <HauntStatus view={view} />
        )}
      </section>

      {view.phase === 'haunting' ? (
        <HauntControls view={view} onStartRitual={props.onStartRitual} onSnooze={props.onSnooze} />
      ) : (
        <PauseMenu
          pause={view.pause}
          busy={view.ritual !== null}
          onPause={props.onPause}
          onResume={props.onResume}
        />
      )}

      {props.ghostAvailable?.value === true && (
        <section class="sbr-panel sbr-ghost-open" aria-label={t('ghost.region')}>
          <button
            type="button"
            disabled={props.ghostOpen?.value === true || props.onOpenGhost === undefined}
            onClick={() => props.onOpenGhost?.()}
          >
            {t('ghost.open')}
          </button>
        </section>
      )}

      <LiveRegion text={announcementFor(view)} />

      <WhisperCaption view={props.view} whisper={props.whisper} />

      {showSoundControl && (
        <section class="sbr-panel sbr-sound">
          {sound === 'blocked' && <p class="sbr-sound-hint">{t('sound.blocked')}</p>}
          <button type="button" onClick={props.onEnableSound}>
            {t('sound.enable')}
          </button>
        </section>
      )}

      <RitualDialog snapshot={props.ritual} onIntent={props.onRitualIntent} />
    </main>
  );
}
