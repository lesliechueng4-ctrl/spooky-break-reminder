// Ritual view model (design: "Core: Rituals"; Requirements 7.3, 8.1, 9.2, 10.2).
//
// The app shell (src/app/ritualSession.ts) builds a snapshot from the pure Ritual state machines and
// passes it to the Ritual dialog. The dialog renders the snapshot and reports what the user did as a
// RitualIntent. The dialog never reads a clock, and it never calls the engine.
import type { BreathingState } from '../../core/rituals/breathing';
import type { RitualOutcome } from '../../core/rituals/common';
import type { EyeState } from '../../core/rituals/eye';
import type { StretchState } from '../../core/rituals/stretch';
import type { RitualOrigin } from '../../core/scheduler';

interface SnapshotBase {
  /** Where the Ritual was started: from Calm_State (early) or from a Haunting (2.5, 7.1). */
  readonly origin: RitualOrigin;
  /** Progress and status from the state machine, for the progress indicator and the effects (4.11). */
  readonly outcome: RitualOutcome;
}

export type RitualSnapshot =
  | (SnapshotBase & { readonly kind: 'eye'; readonly state: EyeState })
  | (SnapshotBase & { readonly kind: 'breathing'; readonly state: BreathingState })
  | (SnapshotBase & { readonly kind: 'stretch'; readonly state: StretchState });

/**
 * What the user did on the Ritual surface. The shell stamps each intent with the monotonic clock.
 * - `press` and `release`: a pointer press or a key press of the hold input (9.4), or a press on the
 *   Eye_Ritual surface outside Abandon (8.4). `repeat` marks an auto-repeated key event.
 * - `key`: any other key on the Eye_Ritual surface. Escape ends a Ritual from anywhere (7.5).
 * - `done`: the completion control of the current stretch step (10.4, 10.5).
 * - `abandon`: the Abandon control (7.5).
 */
export type RitualIntent =
  | { readonly type: 'press'; readonly repeat?: boolean }
  | { readonly type: 'release' }
  | { readonly type: 'key'; readonly key: string }
  | { readonly type: 'done' }
  | { readonly type: 'abandon' };
