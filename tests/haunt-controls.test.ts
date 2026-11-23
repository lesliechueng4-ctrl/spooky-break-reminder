// @vitest-environment happy-dom
// HauntControls and PauseMenu (Requirements 3.5, 7.1, 7.2, 11.1, 11.6, 11.8, 12.1, 12.3, 19.5, 19.6).
// The components render with Preact into happy-dom, and the tests click the real buttons.
import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleView } from '../src/core/scheduler';
import { MINUTE_MS } from '../src/core/time';
import { setLanguage } from '../src/i18n';
import { HauntControls } from '../src/ui/HauntControls';
import { PauseMenu } from '../src/ui/PauseMenu';

type HauntView = Extract<ScheduleView, { phase: 'haunting' }>;

function haunting(overrides: Partial<HauntView> = {}): HauntView {
  return {
    phase: 'haunting',
    level: 2,
    breakType: 'micro',
    overdueMs: 2 * MINUTE_MS,
    overdueWholeMin: 2,
    escalationStepMs: 2 * MINUTE_MS,
    offered: ['eye'],
    snoozesLeft: 3,
    snoozeMs: 5 * MINUTE_MS,
    snoozeRemainingMs: 0,
    jumpScareShown: false,
    ritual: null,
    ...overrides,
  };
}

let container: HTMLElement;

beforeEach(() => {
  setLanguage('en');
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

function labels(): string[] {
  return buttons().map((button) => button.textContent?.trim() ?? '');
}

function buttonLabelled(text: string): HTMLButtonElement {
  const found = buttons().find((button) => button.textContent?.trim() === text);
  if (found === undefined) {
    throw new Error(`no button labelled "${text}"; found ${JSON.stringify(labels())}`);
  }
  return found;
}

describe('HauntControls', () => {
  it('offers only the Eye Ritual and the Snooze control for a Micro_Break', () => {
    render(h(HauntControls, { view: haunting({}) }), container);
    expect(labels()).toEqual(['Start the Eye Ritual', 'Snooze for 5 min']);
  });

  it('offers the Breathing and the Stretch Ritual for a Long_Break', () => {
    const view = haunting({ breakType: 'long', offered: ['breathing', 'stretch'] });
    render(h(HauntControls, { view }), container);
    expect(labels()).toEqual(['Start the Breathing Ritual', 'Start the Stretch Ritual', 'Snooze for 5 min']);
  });

  it('disables the Ritual and Snooze buttons when no handler is wired', () => {
    render(h(HauntControls, { view: haunting({}) }), container);
    expect(buttons().every((button) => button.disabled)).toBe(true);
  });

  it('passes the chosen Ritual kind to the Ritual handler', () => {
    const onStartRitual = vi.fn();
    const view = haunting({ breakType: 'long', offered: ['breathing', 'stretch'] });
    render(h(HauntControls, { view, onStartRitual }), container);

    buttonLabelled('Start the Stretch Ritual').click();

    expect(onStartRitual).toHaveBeenCalledTimes(1);
    expect(onStartRitual).toHaveBeenCalledWith('stretch');
  });

  it('calls the Snooze handler once per click', () => {
    const onSnooze = vi.fn();
    render(h(HauntControls, { view: haunting({}), onSnooze }), container);

    buttonLabelled('Snooze for 5 min').click();

    expect(onSnooze).toHaveBeenCalledTimes(1);
  });

  it('labels the Snooze control with the Snooze_Duration snapshot of the Haunting', () => {
    render(h(HauntControls, { view: haunting({ snoozeMs: 3 * MINUTE_MS }) }), container);
    expect(labels()).toContain('Snooze for 3 min');
  });

  it('disables Snooze while a Snooze runs and shows the time left', () => {
    const view = haunting({ snoozesLeft: 2, snoozeRemainingMs: 299_000 });
    render(h(HauntControls, { view, onSnooze: () => undefined }), container);

    expect(buttonLabelled('Snooze for 5 min').disabled).toBe(true);
    expect(container.textContent).toContain('Snooze ends in 04:59');
  });

  it('replaces the Snooze control with the no-bargains message after three Snoozes', () => {
    render(h(HauntControls, { view: haunting({ snoozesLeft: 0 }), onSnooze: () => undefined }), container);

    expect(labels().some((label) => label.startsWith('Snooze'))).toBe(false);
    expect(container.textContent).toContain('The ghost accepts no further bargains for this haunting.');
  });

  it('disables every control while a Ritual runs', () => {
    const view = haunting({ ritual: 'eye' });
    render(h(HauntControls, { view, onStartRitual: () => undefined, onSnooze: () => undefined }), container);
    expect(buttons().every((button) => button.disabled)).toBe(true);
  });

  it('gives the labels in the active language', () => {
    setLanguage('zh-CN');
    render(h(HauntControls, { view: haunting({}) }), container);
    expect(labels()).toEqual(['开始护眼仪式', '延后 5 分钟']);
  });
});

describe('PauseMenu', () => {
  it('offers 30, 60 and 120 minutes and until resumed in Calm_State', () => {
    render(h(PauseMenu, { pause: null, busy: false, onPause: () => undefined }), container);
    expect(labels()).toEqual(['Pause for 30 min', 'Pause for 60 min', 'Pause for 120 min', 'Pause until I resume']);
  });

  it('passes the chosen duration in wall-clock milliseconds, or null for until resumed', () => {
    const onPause = vi.fn();
    render(h(PauseMenu, { pause: null, busy: false, onPause }), container);

    buttonLabelled('Pause for 30 min').click();
    buttonLabelled('Pause until I resume').click();

    expect(onPause).toHaveBeenNthCalledWith(1, 30 * MINUTE_MS);
    expect(onPause).toHaveBeenNthCalledWith(2, null);
  });

  it('shows the remaining Pause time and a Resume control that calls the resume handler', () => {
    const onResume = vi.fn();
    render(h(PauseMenu, { pause: { remainingMs: 29 * MINUTE_MS }, busy: false, onResume }), container);

    expect(container.textContent).toContain('Paused. 29:00 left.');
    expect(labels()).toEqual(['Resume reminders']);
    buttonLabelled('Resume reminders').click();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('shows "until you resume" instead of a countdown for an open-ended Pause', () => {
    render(h(PauseMenu, { pause: { remainingMs: null }, busy: false, onResume: () => undefined }), container);
    expect(container.textContent).toContain('Paused until you resume.');
  });

  it('disables the Pause buttons while a Ritual runs', () => {
    render(h(PauseMenu, { pause: null, busy: true, onPause: () => undefined }), container);
    expect(buttons().every((button) => button.disabled)).toBe(true);
  });
});
