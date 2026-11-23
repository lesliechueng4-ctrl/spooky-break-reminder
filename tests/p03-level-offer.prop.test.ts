// **Feature: spooky-break-reminder, Property 3: Level and offer invariants over event sequences**
// **Validates: Requirements 3.2, 3.3, 3.6, 7.1, 7.2, 29.2**
//
// For any generated sequence of SchedulerEvents, the derived view after every event has level 0 in
// Calm_State. During a Haunting the level is min(5, 1 + floor(overdue / step)), where step is the
// Escalation_Step in effect when that Haunting started. Within one Haunting the level never
// decreases, and the offered Rituals are ['eye'] for a Micro_Break and ['breathing', 'stretch'] for
// a Long_Break.
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  derive,
  initialState,
  reduce,
  type BreakType,
  type ScheduleView,
  type SchedulerConfig,
  type SchedulerState,
} from '../src/core/scheduler';
import { arbConfig, arbRun } from './arbitraries';

/** Offered Rituals as written in Requirements 7.1 and 7.2. Written here, not read from the code under test. */
const EXPECTED_OFFER: Record<BreakType, readonly string[]> = {
  micro: ['eye'],
  long: ['breathing', 'stretch'],
};

/** What the test remembers about the Haunting that is running, if one is running. */
interface HauntingTrack {
  readonly breakType: BreakType;
  /** Escalation_Step in ms, taken from the config in effect when this Haunting started. */
  readonly stepMs: number;
  lastLevel: number;
}

/** Requirement 3.3, written out directly. */
function expectedLevel(overdueMs: number, stepMs: number): number {
  return Math.min(5, 1 + Math.floor(overdueMs / stepMs));
}

/**
 * Checks one derived view. `track` is the Haunting that was running before this event, or null.
 * Returns the Haunting that is running after this event.
 */
function checkView(
  view: ScheduleView,
  config: SchedulerConfig,
  track: HauntingTrack | null,
): HauntingTrack | null {
  if (view.phase === 'calm') {
    expect(view.level).toBe(0);
    return null;
  }

  // A Haunting that was not running before this event started during it. The config in effect now
  // is the one the Scheduler used to start it, so its step is the Escalation_Step at start.
  const current: HauntingTrack = track ?? {
    breakType: view.breakType,
    stepMs: config.escalationStepMs,
    lastLevel: 0,
  };

  expect(view.breakType).toBe(current.breakType);
  expect(view.level).toBeGreaterThanOrEqual(1);
  expect(view.level).toBeLessThanOrEqual(5);
  expect(view.level).toBe(expectedLevel(view.overdueMs, current.stepMs));
  expect(view.level).toBeGreaterThanOrEqual(current.lastLevel);
  expect(view.offered).toEqual(EXPECTED_OFFER[view.breakType]);

  return { ...current, lastLevel: view.level };
}

describe('Property 3: Level and offer invariants over event sequences', () => {
  it('keeps level and offered Rituals consistent after every event of a generated schedule', () => {
    fc.assert(
      fc.property(
        arbConfig.chain((initial) => arbRun(initial).map((run) => ({ initial, run }))),
        ({ initial, run }) => {
          // Replay the events one at a time. The config is the one in effect after each event,
          // which is how the generator's fold applies configChanged.
          let config: SchedulerConfig = initial;
          let state: SchedulerState = initialState();
          let track: HauntingTrack | null = null;

          for (const event of run.events) {
            if (event.type === 'configChanged') config = event.config;
            state = reduce(state, event, config).state;
            track = checkView(derive(state, config), config, track);
          }

          // The replay reaches the same final state as the generator's fold, so the checks above
          // covered the whole generated sequence.
          expect(state).toEqual(run.state);
          expect(config).toEqual(run.config);
        },
      ),
      { numRuns: 200 },
    );
  });
});
