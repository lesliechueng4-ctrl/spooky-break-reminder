// StretchRitual (Requirements 10.1-10.6). The four steps run in the fixed order of the state machine. Each
// step shows an illustration, its instruction and a 20 s countdown. The completion control is disabled
// until the countdown ends, and it stays disabled while the document is hidden.
import { STRETCH_STEPS, STRETCH_STEP_MS, type StretchState, type StretchStepId } from '../../core/rituals/stretch';
import { t, type MessageKey } from '../../i18n';
import type { RitualIntent } from './types';

const STEP_KEYS: Readonly<Record<StretchStepId, { readonly title: MessageKey; readonly text: MessageKey }>> = {
  neckTilt: { title: 'stretch.neckTilt.title', text: 'stretch.neckTilt.text' },
  shoulderRoll: { title: 'stretch.shoulderRoll.title', text: 'stretch.shoulderRoll.text' },
  wristFinger: { title: 'stretch.wristFinger.title', text: 'stretch.wristFinger.text' },
  standingReach: { title: 'stretch.standingReach.title', text: 'stretch.standingReach.text' },
};

export interface StretchRitualProps {
  readonly state: StretchState;
  readonly onIntent: (intent: RitualIntent) => void;
}

/** A simple figure that shows the pose of one step. It is decorative, so it is hidden from assistive technology. */
function StretchFigure({ step }: { readonly step: StretchStepId }) {
  const arms = {
    neckTilt: [
      [60, 46, 42, 76],
      [60, 46, 78, 76],
    ],
    shoulderRoll: [
      [60, 46, 38, 44],
      [60, 46, 82, 44],
    ],
    wristFinger: [
      [60, 46, 88, 50],
      [60, 46, 32, 50],
    ],
    standingReach: [
      [60, 46, 48, 8],
      [60, 46, 72, 8],
    ],
  }[step];

  return (
    <svg class="sbr-stretch-figure" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="22" r="11" transform={step === 'neckTilt' ? 'rotate(-20 60 33)' : undefined} />
      <line x1="60" y1="33" x2="60" y2="80" />
      <line x1="60" y1="80" x2="48" y2="112" />
      <line x1="60" y1="80" x2="72" y2="112" />
      {arms.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      {step === 'shoulderRoll' && <path d="M 30 40 Q 60 6 90 40" />}
    </svg>
  );
}

export function StretchRitual({ state, onIntent }: StretchRitualProps) {
  const step = STRETCH_STEPS[state.stepIndex];
  const ready = state.stepElapsedMs >= STRETCH_STEP_MS;
  const hidden = state.clock.hiddenAt !== null;
  const enabled = ready && !hidden && state.status === 'running';
  const lastStep = state.stepIndex === STRETCH_STEPS.length - 1;
  const secondsLeft = Math.ceil(Math.max(0, STRETCH_STEP_MS - state.stepElapsedMs) / 1000);

  return (
    <section class="sbr-ritual-stretch-body">
      <p class="sbr-ritual-note">{t('stretch.stepOf', { step: state.stepIndex + 1, total: STRETCH_STEPS.length })}</p>
      <h3 class="sbr-stretch-title" data-autofocus tabIndex={-1}>
        {t(STEP_KEYS[step].title)}
      </h3>
      <StretchFigure step={step} />
      <p class="sbr-ritual-instruction">{t(STEP_KEYS[step].text)}</p>
      {ready ? (
        <p class="sbr-ritual-note">{t('stretch.ready')}</p>
      ) : (
        <p class="sbr-ritual-countdown">{t('stretch.unlockIn', { seconds: secondsLeft })}</p>
      )}
      <button type="button" disabled={!enabled} onClick={() => onIntent({ type: 'done' })}>
        {lastStep ? t('stretch.finish') : t('stretch.next')}
      </button>
    </section>
  );
}
