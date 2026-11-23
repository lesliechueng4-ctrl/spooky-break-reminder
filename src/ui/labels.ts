// Message keys for break types and Ritual names, shared by the Main_Screen and its controls.
// Kept in its own module so that the controls do not import the Main_Screen (no import cycle).
import type { BreakType, RitualKind } from '../core/scheduler';
import type { MessageKey } from '../i18n';

export const BREAK_KEY: Readonly<Record<BreakType, MessageKey>> = {
  micro: 'break.micro',
  long: 'break.long',
};

export const RITUAL_KEY: Readonly<Record<RitualKind, MessageKey>> = {
  eye: 'ritual.eye',
  breathing: 'ritual.breathing',
  stretch: 'ritual.stretch',
};
