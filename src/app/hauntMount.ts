// Mounts the HauntLayer on the App document and keeps it in step with the schedule (design: "Effects
// Renderer", "Runtime Loop" step 4; Requirements 4.1-4.12, 19.3, 19.4).
//
// Every visual change goes through `layer.update(targets)`, and the layer's animator passes it through
// the Flash_Guard. Reduced_Motion goes to the layer's own setting, so geometry snaps and the crossfade
// is used in its place (19.3). The layer is appended to the body and sits below the UI panels, which are
// opaque, so no text loses contrast to the effects (4.10, 19.6).
import { effect, type ReadonlySignal } from '@preact/signals';
import { effectsFor } from '../core/escalation';
import { MINUTE_MS } from '../core/time';
import { createHauntLayer, type HauntLayer, type TransitionKind } from '../effects/hauntLayer';
import type { AppStore } from './store';

export interface HauntMountOptions {
  readonly store: AppStore;
  readonly doc: Document;
  /** The effective Reduced_Motion value: the Settings_Panel override, or the operating system when set to system. */
  readonly reducedMotion: ReadonlySignal<boolean>;
  /** Progress in [0, 1] of the running Ritual, or 0 when none runs. It fades the effects (Requirement 4.11). */
  readonly ritualProgress: ReadonlySignal<number>;
  /** Seed of the crack layout and the fog textures. */
  readonly seed: number;
}

/** Mounts the layer and returns the function that removes it and stops its effects. */
export function mountHauntLayer(options: HauntMountOptions): () => void {
  const { store, doc, reducedMotion, ritualProgress, seed } = options;
  const layer: HauntLayer = createHauntLayer(doc, { reducedMotion: reducedMotion.peek(), seed });
  doc.body.append(layer.root);

  let previousPhase: 'calm' | 'haunting' | null = null;
  // The count at mount time is not a presentation, so only a later change plays the Jump_Scare here.
  let presentedCount = store.jumpScareCount.peek();

  const disposers = [
    effect(() => {
      layer.setReducedMotion(reducedMotion.value);
    }),
    // Every mounted layer plays the Jump_Scare timeline, so the App document and the Ghost_Window show it together.
    // The engine decides when a presentation happens (Requirements 6.5-6.7). The layer's frames stop while its
    // document is hidden, and the timeline ends within 2 s of its start (Requirement 6.8).
    effect(() => {
      const count = store.jumpScareCount.value;
      if (count === presentedCount) return;
      presentedCount = count;
      layer.playJumpScare();
    }),
    effect(() => {
      const view = store.view.value;
      // The Escalation_Step comes from the view, which carries the value the Haunting started with (3.3, 3.5).
      // Calm_State has no Haunting, and effectsFor ignores the step there, so one minute only fills the argument.
      const escalationStepMs = view.phase === 'haunting' ? view.escalationStepMs : MINUTE_MS;
      const targets = effectsFor(view, {
        reducedMotion: reducedMotion.value,
        ritualProgress: ritualProgress.value,
        escalationStepMs,
      });
      // A Ritual_Exorcism dissolves the effects over 2.5 s (4.12). Other changes use the 1.2 s transition.
      const transition: TransitionKind = previousPhase === 'haunting' && view.phase === 'calm' ? 'dissolve' : 'standard';
      previousPhase = view.phase;
      layer.update(targets, transition);
    }),
  ];

  return () => {
    for (const dispose of disposers) dispose();
    layer.dispose();
  };
}
