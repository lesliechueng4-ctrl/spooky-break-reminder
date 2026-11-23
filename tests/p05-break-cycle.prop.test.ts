// **Feature: spooky-break-reminder, Property 5: Break cycle**
// **Validates: Requirements 1.2, 1.3, 1.4, 2.6, 29.3**
//
// For any Long_Break_Frequency N in 1..10 and any sequence of Ritual_Exorcisms (from Hauntings or early
// breaks) without an intervening qualifying Away_Period, the k-th break after the last reset is a
// Long_Break exactly when k is a multiple of N, and Break_Counter stays in 0..N-1, also after any
// configChanged that lowers N.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbConfig, arbRun } from './arbitraries';
import {
  initialState,
  reduce,
  type DomainEvent,
  type SchedulerConfig,
  type SchedulerEvent,
  type SchedulerState,
} from '../src/core/scheduler';

/** One replayed event: the configuration in effect after it, the resulting state and the DomainEvents it emitted. */
interface Step {
  readonly config: SchedulerConfig;
  readonly state: SchedulerState;
  readonly domain: DomainEvent[];
}

/**
 * Replays events from the initial state the same way `foldRun` does, but keeps every intermediate
 * step, so the properties can check the invariants after each event rather than only at the end.
 */
function replay(cfg: SchedulerConfig, events: readonly SchedulerEvent[]): Step[] {
  let config = cfg;
  let state = initialState();
  return events.map((event) => {
    if (event.type === 'configChanged') config = event.config;
    const result = reduce(state, event, config);
    state = result.state;
    return { config, state, domain: result.events };
  });
}

/**
 * Runs with a fixed Long_Break_Frequency. Every configChanged that would change N is removed, because
 * the k-th break rule is stated for a fixed N. The remaining events are still a reachable sequence.
 */
const arbFixedFrequencyCase = arbConfig.chain((cfg) =>
  arbRun(cfg).map((run) => ({
    cfg,
    events: run.events.filter(
      (e) => e.type !== 'configChanged' || e.config.longBreakFrequency === cfg.longBreakFrequency,
    ),
  })),
);

/** Runs that may lower N in the middle of a schedule, so the range invariant is checked after each change. */
const arbAnyFrequencyCase = arbConfig.chain((cfg) =>
  arbRun(cfg).map((run) => ({ cfg, run })),
);

describe('Property 5: Break cycle', () => {
  it('makes the k-th break after the last reset a Long_Break exactly when k is a multiple of N', () => {
    fc.assert(
      fc.property(arbFixedFrequencyCase, ({ cfg, events }) => {
        const n = cfg.longBreakFrequency;
        // Breaks completed since the last reset (a qualifying Away_Period), counted as k.
        let k = 0;
        for (const step of replay(cfg, events)) {
          for (const d of step.domain) {
            if (d.type === 'awayExorcism' || d.type === 'awayReset') k = 0;
            if (d.type === 'ritualExorcism') {
              k += 1;
              expect(d.breakType).toBe(k % n === 0 ? 'long' : 'micro');
            }
          }
          // Break_Counter is the number of breaks since the last reset, modulo N (0..N-1).
          expect(step.state.breakCounter).toBe(k % n);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps Break_Counter in 0..N-1 after every event, including each configChanged that lowers N', () => {
    fc.assert(
      fc.property(arbAnyFrequencyCase, ({ cfg, run }) => {
        const steps = replay(cfg, run.events);
        for (const step of steps) {
          expect(step.state.breakCounter).toBeGreaterThanOrEqual(0);
          expect(step.state.breakCounter).toBeLessThan(step.config.longBreakFrequency);
        }
        // The replay reaches the same state as the shared generator, read with the configuration in effect.
        const last = steps.at(-1);
        expect(last?.state ?? initialState()).toEqual(run.state);
        expect(run.state.breakCounter).toBeGreaterThanOrEqual(0);
        expect(run.state.breakCounter).toBeLessThan(run.config.longBreakFrequency);
      }),
      { numRuns: 200 },
    );
  });
});
