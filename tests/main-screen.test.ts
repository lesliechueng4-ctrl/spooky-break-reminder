// Main_Screen text helpers (Requirements 4.13, 4.14, 19.7). The helpers are pure: they read the active
// language and return strings, so no DOM is needed.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ScheduleView } from '../src/core/scheduler';
import { MINUTE_MS } from '../src/core/time';
import { setLanguage } from '../src/i18n';
import { announcementFor, captionFor, ritualList } from '../src/ui/MainScreen';

type HauntView = Extract<ScheduleView, { phase: 'haunting' }>;

function haunting(overrides: Partial<HauntView>): ScheduleView {
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
    ...overrides,
  };
}

const CALM: ScheduleView = {
  phase: 'calm',
  level: 0,
  remainingMs: 12 * MINUTE_MS,
  candleFraction: 0.6,
  nextBreak: 'micro',
  pause: null,
  ritual: null,
};

describe('captionFor', () => {
  beforeEach(() => setLanguage('en'));

  it('returns null when no Whisper plays or the schedule is in Calm_State', () => {
    expect(captionFor(haunting({}), null)).toBeNull();
    expect(captionFor(CALM, { id: 1 })).toBeNull();
  });

  it('names the Eye Ritual for a Micro_Break', () => {
    expect(captionFor(haunting({}), { id: 4 })).toBe('Do the Eye Ritual. Look far away.');
  });

  it('alternates between the two Rituals of a Long_Break from one Whisper to the next', () => {
    const view = haunting({ breakType: 'long', offered: ['breathing', 'stretch'] });
    expect(captionFor(view, { id: 1 })).toBe('Do the Stretch Ritual. Reach and stretch.');
    expect(captionFor(view, { id: 2 })).toBe('Do the Breathing Ritual. Breathe slowly.');
  });

  it('gives the caption in the active language', () => {
    setLanguage('zh-CN');
    expect(captionFor(haunting({}), { id: 1 })).toBe('去做护眼仪式，望向远处。');
  });
});

describe('announcementFor', () => {
  beforeEach(() => setLanguage('en'));

  it('names the level and the due Ritual, and not the overdue minutes', () => {
    const early = announcementFor(haunting({ overdueMs: MINUTE_MS, overdueWholeMin: 1 }));
    const late = announcementFor(haunting({ overdueMs: 9 * MINUTE_MS, overdueWholeMin: 9 }));
    expect(early).toBe('Haunting level 3. Due now: Eye Ritual.');
    expect(late).toBe(early);
  });

  it('names the next break in Calm_State', () => {
    expect(announcementFor(CALM)).toBe('The candle is lit. Next break: Micro break.');
  });
});

describe('ritualList', () => {
  beforeEach(() => setLanguage('en'));

  it('joins two Rituals with "or" and lists a single Ritual by its name', () => {
    expect(ritualList(['breathing', 'stretch'])).toBe('Breathing Ritual or Stretch Ritual');
    expect(ritualList(['eye'])).toBe('Eye Ritual');
  });
});
