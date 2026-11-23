// EyeRitual (Requirements 8.1-8.3). The dark screen holds only the countdown and the instruction. The
// Abandon control and the dialog around it belong to RitualDialog, so this screen renders no buttons.
import { EYE_DURATION_MS, type EyeState } from '../../core/rituals/eye';
import { t } from '../../i18n';

export interface EyeRitualProps {
  readonly state: EyeState;
}

export function EyeRitual({ state }: EyeRitualProps) {
  // Whole seconds, rounded up, so the countdown shows 20 at the start and 1 in the last second (8.2).
  const seconds = Math.ceil(Math.max(0, EYE_DURATION_MS - state.elapsedMs) / 1000);

  return (
    <section class="sbr-ritual-eye-body" data-autofocus tabIndex={-1}>
      <p class="sbr-ritual-countdown" role="timer">
        {t('ritual.seconds', { seconds })}
      </p>
      <p class="sbr-ritual-instruction">{t('eye.instruction')}</p>
    </section>
  );
}
