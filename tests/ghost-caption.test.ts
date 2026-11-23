// @vitest-environment happy-dom
// The Whisper caption in the Ghost_Window (Requirements 4.13, 4.14). The store carries the audible Whisper, and
// GhostPanel renders the caption from it. The audio fake is hand-written and only holds a state and notifies its
// listeners. The store, the signals and the component are real.
import { signal } from '@preact/signals';
import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppStore, type AppStore } from '../src/app/store';
import type { ScheduleView } from '../src/core/scheduler';
import { MINUTE_MS } from '../src/core/time';
import { setLanguage } from '../src/i18n';
import type { AudioEngine, AudioState } from '../src/platform/audio/engine';
import { GhostPanel } from '../src/ui/GhostPanel';
import type { RitualSnapshot } from '../src/ui/rituals/types';

interface FakeAudio {
  readonly audio: AudioEngine;
  publish(next: AudioState): void;
}

function fakeAudio(): FakeAudio {
  let state: AudioState = { status: 'running', whisper: null, outputGain: 0 };
  const listeners = new Set<(next: AudioState) => void>();

  const audio: AudioEngine = {
    unlock: () => Promise.resolve(),
    update: () => undefined,
    playChime: () => false,
    playCue: () => false,
    playScream: () => false,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => undefined,
  };

  return {
    audio,
    publish: (next) => {
      state = next;
      for (const listener of listeners) listener(next);
    },
  };
}

function hauntingView(): ScheduleView {
  return {
    phase: 'haunting',
    level: 3,
    breakType: 'micro',
    overdueMs: MINUTE_MS,
    overdueWholeMin: 1,
    escalationStepMs: 2 * MINUTE_MS,
    offered: ['eye'],
    snoozesLeft: 3,
    snoozeMs: 5 * MINUTE_MS,
    snoozeRemainingMs: 0,
    jumpScareShown: false,
    ritual: null,
  };
}

/** Lets Preact apply the signal updates that the test caused. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let container: HTMLElement;
let fake: FakeAudio;
let store: AppStore;

beforeEach(() => {
  setLanguage('en');
  fake = fakeAudio();
  store = createAppStore({ audio: fake.audio, demo: false, defaultLanguage: 'en' });
  store.setView(hauntingView());

  container = document.createElement('div');
  document.body.append(container);
  render(
    h(GhostPanel, {
      view: store.view,
      whisper: store.whisper,
      ritual: signal<RitualSnapshot | null>(null),
      onStartRitual: () => undefined,
      onSnooze: () => undefined,
      onRitualIntent: () => undefined,
    }),
    container,
  );
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('Ghost_Window Whisper caption', () => {
  it('shows the caption of the audible Whisper from the store, and hides it from assistive technology', async () => {
    fake.publish({ status: 'running', whisper: { id: 4 }, outputGain: 0 });
    await settle();

    const caption = container.querySelector('.sbr-caption');
    expect(caption?.textContent).toBe('Do the Eye Ritual. Look far away.');
    expect(caption?.getAttribute('aria-hidden')).toBe('true');
  });

  it('removes the caption when the Whisper ends', async () => {
    fake.publish({ status: 'running', whisper: { id: 4 }, outputGain: 0 });
    await settle();
    expect(container.querySelector('.sbr-caption')).not.toBeNull();

    fake.publish({ status: 'running', whisper: null, outputGain: 0 });
    await settle();
    expect(container.querySelector('.sbr-caption')).toBeNull();
  });
});
