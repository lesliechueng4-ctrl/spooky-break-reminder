// GhostPanel (design: "UI Components"; Requirements 17.3, 17.4, 17.5, 20.1, 19.6).
//
// The content of the Ghost_Window. In Calm_State it shows the candle and the remaining time. During a Haunting
// it shows the Haunting_Level, the Overdue_Duration, the Ritual start controls and the Snooze control. The
// Ghost_Window's own HauntLayer draws the effects behind this panel. The app shell mounts that layer and renders
// this component into the window (src/app/ghostWindow.ts).
//
// The component reads signals and calls callbacks. It never calls the engine, the Ritual session or a platform
// adapter, and it writes no DOM outside its own tree. Every text goes through t(), and every text sits on an
// opaque .sbr-panel (Requirements 4.10, 19.6). The Ritual dialog here is the window's own dialog, so a Ritual
// started in the Ghost_Window is shown in that window.
import type { ReadonlySignal } from '@preact/signals';
import type { RitualKind, ScheduleView } from '../core/scheduler';
import { formatClock } from '../core/tabStatus';
import { t } from '../i18n';
import { Candle } from './Candle';
import { HauntControls } from './HauntControls';
import { announcementFor, LiveRegion } from './LiveRegion';
import { BREAK_KEY } from './labels';
import { RitualDialog } from './rituals/RitualDialog';
import type { RitualIntent, RitualSnapshot } from './rituals/types';
import { WhisperCaption, type WhisperLine } from './WhisperCaption';

export interface GhostPanelProps {
  /** The schedule view, shared with the Main_Screen. */
  readonly view: ReadonlySignal<ScheduleView>;
  /**
   * The audible Whisper, shared with the Main_Screen through the store. Both documents show the same caption for the
   * same duration (Requirements 4.13, 4.14).
   */
  readonly whisper: ReadonlySignal<WhisperLine | null>;
  /** The Ritual that runs in the Ghost_Window, or null (Requirement 17.5). */
  readonly ritual: ReadonlySignal<RitualSnapshot | null>;
  /** Starts the Ritual that the Haunting offers. */
  readonly onStartRitual: (kind: RitualKind) => void;
  /** Snoozes the Haunting (Requirement 11.2). The Snooze hides the effects in this window too. */
  readonly onSnooze: () => void;
  /** Receives what the user does inside the Ritual dialog of this window. */
  readonly onRitualIntent: (intent: RitualIntent) => void;
}

export function GhostPanel({
  view: viewSignal,
  whisper,
  ritual,
  onStartRitual,
  onSnooze,
  onRitualIntent,
}: GhostPanelProps) {
  const view = viewSignal.value;

  return (
    <main id="sbr-main" class="sbr-main sbr-ghost" tabIndex={-1} aria-label={t('ghost.region')}>
      <Candle lit={view.phase === 'calm'} fraction={view.phase === 'calm' ? view.candleFraction : 0} />

      <section class="sbr-panel sbr-status">
        {view.phase === 'calm' ? (
          <>
            <h2>{t('calm.heading')}</h2>
            <p>{t('calm.timeLeft')}</p>
            <p class="sbr-countdown">{formatClock(view.remainingMs)}</p>
            <p>{t('calm.nextBreak', { breakType: t(BREAK_KEY[view.nextBreak]) })}</p>
          </>
        ) : (
          <>
            <h2>{t('haunt.heading')}</h2>
            <p>{t('haunt.level', { level: view.level })}</p>
            <p class="sbr-overdue">{t('haunt.overdue', { minutes: view.overdueWholeMin })}</p>
          </>
        )}
      </section>

      {view.phase === 'haunting' && (
        <HauntControls view={view} onStartRitual={onStartRitual} onSnooze={onSnooze} />
      )}

      {/* The window is a separate document with its own accessibility tree, so it announces the same changes (19.7). */}
      <LiveRegion text={announcementFor(view)} />

      <WhisperCaption view={viewSignal} whisper={whisper} />

      <RitualDialog snapshot={ritual} onIntent={onRitualIntent} />
    </main>
  );
}
