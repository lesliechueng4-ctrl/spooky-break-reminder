// BreathingRitual (Requirements 9.2-9.7, 19.5). The breathing target is a real button. A pointer hold
// (pointer capture keeps the release even when the pointer leaves the target) and a held Space key both
// send the hold input. Clicks are not used, so Space does not fire a second activation.
import {
  BREATH_CYCLES,
  EXHALE_MS,
  INHALE_MS,
  breathingGuide,
  type BreathingState,
} from '../../core/rituals/breathing';
import type { HintKey } from '../../core/rituals/common';
import { t, type MessageKey } from '../../i18n';
import type { RitualIntent } from './types';

const HINT_KEY: Readonly<Record<HintKey, MessageKey>> = {
  exhaleReminder: 'breathing.hint.exhaleReminder',
  holdTooShort: 'breathing.hint.holdTooShort',
  holdTooLong: 'breathing.hint.holdTooLong',
};

/** Scale of the guide circle at the end of an exhale and at the end of an inhale. */
const EXHALED_SCALE = 0.6;
const INHALED_SCALE = 1;

export interface BreathingRitualProps {
  readonly state: BreathingState;
  readonly onIntent: (intent: RitualIntent) => void;
}

export function BreathingRitual({ state, onIntent }: BreathingRitualProps) {
  const guide = breathingGuide(state);
  const inhaling = guide.phase === 'inhale';
  const phaseMs = inhaling ? INHALE_MS : EXHALE_MS;
  const secondsLeft = Math.ceil(Math.max(0, phaseMs - guide.phaseElapsedMs) / 1000);
  const holding = state.holdStartedAt !== null;

  return (
    <section class="sbr-ritual-breath-body">
      <p class="sbr-ritual-instruction">{t('breathing.instruction')}</p>
      <p class="sbr-ritual-phase">{inhaling ? t('breathing.inhale') : t('breathing.exhale')}</p>
      <p class="sbr-ritual-countdown">{t('ritual.seconds', { seconds: secondsLeft })}</p>
      <div class="sbr-breath-guide" aria-hidden="true">
        {/* Under Reduced_Motion the CSS drops the scale and shows the phase by opacity (19.3). */}
        <div
          class="sbr-breath-circle sbr-move"
          data-phase={guide.phase}
          style={{
            transform: `scale(${inhaling ? INHALED_SCALE : EXHALED_SCALE})`,
            transitionDuration: `${phaseMs}ms`,
          }}
        />
      </div>
      <button
        type="button"
        class="sbr-breath-target"
        data-autofocus
        aria-pressed={holding}
        onPointerDown={(event) => {
          const target = event.currentTarget;
          if (typeof target.setPointerCapture === 'function') {
            target.setPointerCapture(event.pointerId);
          }
          onIntent({ type: 'press' });
        }}
        onPointerUp={() => onIntent({ type: 'release' })}
        onPointerCancel={() => onIntent({ type: 'release' })}
        onKeyDown={(event) => {
          if (event.key !== ' ') return;
          event.preventDefault();
          onIntent({ type: 'press', repeat: event.repeat });
        }}
        onKeyUp={(event) => {
          if (event.key !== ' ') return;
          event.preventDefault();
          onIntent({ type: 'release' });
        }}
      >
        {holding ? t('breathing.holding') : t('breathing.target')}
      </button>
      <p class="sbr-ritual-note" aria-live="polite">
        {state.hint === null ? '' : t(HINT_KEY[state.hint])}
      </p>
      <p class="sbr-ritual-note">{t('breathing.progress', { done: state.validHolds, total: BREATH_CYCLES })}</p>
    </section>
  );
}
