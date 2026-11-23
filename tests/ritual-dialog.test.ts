// @vitest-environment happy-dom
// RitualDialog with the three Ritual screens (Requirements 7.3, 7.5, 7.9, 8.1, 8.3, 8.4, 9.2, 9.4, 10.2,
// 10.3, 19.5). The tests render the real components into happy-dom and send real DOM events. Keyboard and
// pointer inputs both produce the same intents, so each Ritual is completable with either alone.
import { signal } from '@preact/signals';
import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { breathingStep, startBreathing } from '../src/core/rituals/breathing';
import { eyeOutcome, eyeStep, startEye } from '../src/core/rituals/eye';
import { stretchOutcome, stretchStep, startStretch } from '../src/core/rituals/stretch';
import { setLanguage } from '../src/i18n';
import { RitualDialog } from '../src/ui/rituals/RitualDialog';
import type { RitualIntent, RitualSnapshot } from '../src/ui/rituals/types';

/** Lets Preact's batched render run after a signal change. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function eyeSnapshot(elapsedMs: number): RitualSnapshot {
  const state = eyeStep(startEye(0), { type: 'tick', at: elapsedMs });
  return { kind: 'eye', origin: 'haunting', outcome: eyeOutcome(state), state };
}

function breathingSnapshot(hint: 'short' | 'none'): RitualSnapshot {
  let state = startBreathing(0);
  if (hint === 'short') {
    state = breathingStep(state, { type: 'press', at: 0 });
    state = breathingStep(state, { type: 'release', at: 2_000 });
  }
  return { kind: 'breathing', origin: 'haunting', outcome: { status: 'running', progress: 0 }, state };
}

function stretchSnapshot(elapsedMs: number): RitualSnapshot {
  const state = stretchStep(startStretch(0), { type: 'tick', at: elapsedMs });
  return { kind: 'stretch', origin: 'early', outcome: stretchOutcome(state), state };
}

let container: HTMLElement;
let intents: RitualIntent[];

beforeEach(() => {
  setLanguage('en');
  intents = [];
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

function mount(initial: RitualSnapshot | null) {
  const snapshot = signal<RitualSnapshot | null>(initial);
  render(h(RitualDialog, { snapshot, onIntent: (intent) => intents.push(intent) }), container);
  const dialog = container.querySelector('dialog');
  if (dialog === null) throw new Error('no dialog rendered');
  return { snapshot, dialog };
}

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

function buttonLabelled(text: string): HTMLButtonElement {
  const found = buttons().find((button) => button.textContent?.trim() === text);
  if (found === undefined) {
    throw new Error(`no button labelled "${text}"; found ${JSON.stringify(buttons().map((b) => b.textContent))}`);
  }
  return found;
}

function keydown(target: Element, key: string, repeat = false): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true }));
}

function keyup(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

function pointer(target: Element, type: 'pointerdown' | 'pointerup'): void {
  target.dispatchEvent(new Event(type, { bubbles: true }));
}

describe('dialog shell', () => {
  it('opens as a modal when a Ritual starts and closes when it ends', async () => {
    const { snapshot, dialog } = mount(null);
    expect(dialog.open).toBe(false);

    snapshot.value = eyeSnapshot(0);
    await flush();
    expect(dialog.open).toBe(true);

    snapshot.value = null;
    await flush();
    expect(dialog.open).toBe(false);
  });

  it('turns a native cancel (Escape) into an Escape intent and keeps the dialog open', () => {
    const { dialog } = mount(eyeSnapshot(0));

    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(intents).toEqual([{ type: 'key', key: 'Escape' }]);
  });

  it('traps Tab inside the dialog by wrapping focus at its last element', () => {
    mount(eyeSnapshot(0));
    const abandon = buttonLabelled('Abandon the Ritual');
    abandon.focus();

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    abandon.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
  });

  it('gives focus back to the element that started the Ritual when the Ritual ends', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'Start the Eye Ritual';
    document.body.append(outside);
    outside.focus();

    const { snapshot } = mount(null);
    snapshot.value = eyeSnapshot(0);
    await flush();
    expect(document.activeElement).not.toBe(outside);

    snapshot.value = null;
    await flush();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('gives the labels in the active language', () => {
    setLanguage('zh-CN');
    mount(eyeSnapshot(0));
    expect(buttons().map((button) => button.textContent?.trim())).toEqual(['放弃仪式']);
  });
});

describe('Eye_Ritual screen (Requirements 8.1, 8.3, 8.4, 7.9)', () => {
  it('shows only the countdown, the instruction and the Abandon control', () => {
    mount(eyeSnapshot(0));

    expect(container.textContent).toContain('20 s');
    expect(container.textContent).toContain('Look at something at least 6 metres (20 feet) away.');
    expect(buttons()).toHaveLength(1);
    expect(container.querySelector('progress')).toBeNull();
  });

  it('counts the whole seconds left, rounded up', () => {
    mount(eyeSnapshot(12_400));
    expect(container.textContent).toContain('8 s');
  });

  it('sends an abandon intent from the Abandon control', () => {
    mount(eyeSnapshot(0));

    buttonLabelled('Abandon the Ritual').click();

    expect(intents).toEqual([{ type: 'abandon' }]);
  });

  it('sends a press for a pointer press on the surface, but not on Abandon', () => {
    mount(eyeSnapshot(0));
    const surface = container.querySelector('.sbr-ritual-eye-body');
    if (surface === null) throw new Error('no eye surface');

    pointer(surface, 'pointerdown');
    pointer(buttonLabelled('Abandon the Ritual'), 'pointerdown');

    expect(intents).toEqual([{ type: 'press' }]);
  });

  it('sends a key intent for keys on the surface, and none for Tab on Abandon', () => {
    mount(eyeSnapshot(0));
    const surface = container.querySelector('.sbr-ritual-eye-body');
    if (surface === null) throw new Error('no eye surface');

    keydown(surface, 'a');
    keydown(buttonLabelled('Abandon the Ritual'), 'Tab');

    expect(intents).toEqual([{ type: 'key', key: 'a' }]);
  });
});

describe('Breathing_Ritual screen (Requirements 9.2, 9.4, 9.6, 19.5)', () => {
  it('sends press and release for a held Space key and ignores other keys', () => {
    mount(breathingSnapshot('none'));
    const target = container.querySelector('.sbr-breath-target');
    if (target === null) throw new Error('no breathing target');

    keydown(target, ' ');
    keydown(target, ' ', true);
    keyup(target, ' ');
    keydown(target, 'a');

    expect(intents).toEqual([
      { type: 'press', repeat: false },
      { type: 'press', repeat: true },
      { type: 'release' },
    ]);
  });

  it('sends press and release for a held pointer on the breathing target', () => {
    mount(breathingSnapshot('none'));
    const target = container.querySelector('.sbr-breath-target');
    if (target === null) throw new Error('no breathing target');

    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');

    expect(intents).toEqual([{ type: 'press' }, { type: 'release' }]);
  });

  it('shows the pacing hint from the state and the counted breaths', () => {
    mount(breathingSnapshot('short'));

    expect(container.textContent).toContain('That hold was too short. Hold for 3 to 6 seconds.');
    expect(container.textContent).toContain('Breaths counted: 0 of 6');
  });

  it('focuses the breathing target when the Ritual opens', async () => {
    const { snapshot } = mount(null);
    snapshot.value = breathingSnapshot('none');
    await flush();

    expect(document.activeElement).toBe(container.querySelector('.sbr-breath-target'));
  });
});

describe('Stretch_Ritual screen (Requirements 10.2, 10.3)', () => {
  it('keeps the completion control disabled until the 20 s countdown ends, then sends done', async () => {
    const { snapshot } = mount(stretchSnapshot(19_999));
    expect(buttonLabelled('Next stretch').disabled).toBe(true);

    snapshot.value = stretchSnapshot(20_000);
    await flush();
    expect(buttonLabelled('Next stretch').disabled).toBe(false);

    buttonLabelled('Next stretch').click();
    expect(intents).toEqual([{ type: 'done' }]);
  });

  it('shows the step title and the step number in the active language', () => {
    mount(stretchSnapshot(0));
    expect(container.textContent).toContain('Step 1 of 4');
    expect(container.textContent).toContain('Neck tilt');
  });
});
