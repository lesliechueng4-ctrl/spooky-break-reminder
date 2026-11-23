// **Feature: spooky-break-reminder, Property 8: Snooze is transparent to overdue accrual and limited to three**
// **Validates: Requirements 11.1, 11.2, 11.3, 11.7, 11.8, 11.9, 29.4**
//
// For any Haunting state and any sequence of snooze, advance, ritualStarted, ritualEnded and
// configChanged events:
// - the Overdue_Duration equals that of the same sequence with the snooze events removed;
// - at most three snooze events per Haunting change the state;
// - every accepted Snooze lasts the Snooze_Duration in effect when the Haunting started, unless a
//   ritualStarted ends it earlier, and a Snooze ended that way stays counted;
// - after a Snooze ends, the level equals the level computed from the full Overdue_Duration.
//
// The test replays each sequence through the real `reduce` and `derive`. Next to the real schedule
// it runs a reference schedule that receives the same events without the snooze events. A small
// model tracks the accepted Snoozes and the schedule time each one has taken.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { HauntPhase } from '../src/core/persistence';
import {
  derive,
  levelFor,
  offeredRituals,
  reduce,
  type SchedulerConfig,
  type SchedulerState,
} from '../src/core/scheduler';
import { MINUTE_MS, type Speed } from '../src/core/time';
import { arbConfig, arbRun, type Run } from './arbitraries';

/** Largest advance generated, 3 hours (same bound as the shared generators). */
const MAX_ADVANCE_MS = 3 * 60 * MINUTE_MS;
/** Requirement 11.8: at most three Snoozes per Haunting. */
const SNOOZE_LIMIT = 3;

type AdvanceMode = 'fixed' | 'snoozeEnd' | 'levelEdge';
type AdvanceStep = {
  readonly kind: 'advance';
  readonly mode: AdvanceMode;
  readonly amountMs: number;
  readonly offset: -1 | 0 | 1;
};

/**
 * One generated step. An advance can aim at the end of the running Snooze or at the next Haunting
 * level boundary, so those edges are exercised. A ritualStarted picks one of the Rituals offered
 * for the Haunting's break type when it runs.
 */
type Step =
  | { readonly kind: 'snooze' }
  | AdvanceStep
  | { readonly kind: 'ritualStarted'; readonly pick: number }
  | { readonly kind: 'ritualEnded' }
  | { readonly kind: 'configChanged'; readonly config: SchedulerConfig };

/** A Haunting to start the sequence from, and the configuration in effect for it. */
interface Start {
  readonly config: SchedulerConfig;
  readonly state: SchedulerState;
  /** True when this file started the Haunting from a Calm state under `config`. */
  readonly startedHere: boolean;
}

const arbAdvanceStep: fc.Arbitrary<AdvanceStep> = fc
  .record({
    mode: fc.constantFrom<AdvanceMode>('snoozeEnd', 'snoozeEnd', 'levelEdge', 'fixed'),
    amountMs: fc.oneof(
      {
        weight: 2,
        arbitrary: fc.constantFrom(0, 1, MINUTE_MS, 2 * MINUTE_MS, 5 * MINUTE_MS, 20 * MINUTE_MS),
      },
      { weight: 1, arbitrary: fc.integer({ min: 0, max: MAX_ADVANCE_MS }) },
    ),
    offset: fc.constantFrom<-1 | 0 | 1>(-1, 0, 1),
  })
  .map(({ mode, amountMs, offset }): AdvanceStep => ({ kind: 'advance', mode, amountMs, offset }));

// Snooze and advance are weighted high so that a sequence often reaches the limit of three Snoozes.
// A page keeps its speed, so configuration changes in a sequence keep the speed of its start.
function arbStepFor(speed: Speed): fc.Arbitrary<Step> {
  return fc.oneof(
    { weight: 6, arbitrary: fc.constant<Step>({ kind: 'snooze' }) },
    { weight: 6, arbitrary: arbAdvanceStep },
    {
      weight: 1,
      arbitrary: fc.nat({ max: 1 }).map((pick): Step => ({ kind: 'ritualStarted', pick })),
    },
    { weight: 2, arbitrary: fc.constant<Step>({ kind: 'ritualEnded' }) },
    {
      weight: 1,
      arbitrary: arbConfig.map((config): Step => ({ kind: 'configChanged', config: { ...config, speed } })),
    },
  );
}

/**
 * A Haunting state. `arbRun` produces a reachable schedule and the configuration in effect at its
 * end. If that schedule is in Calm_State, it is moved into a Haunting by clearing any Pause and
 * Ritual and letting the Work_Interval run out under that same configuration.
 */
const arbHauntingStart: fc.Arbitrary<Start> = arbConfig
  .chain((cfg) => arbRun(cfg, 30))
  .map((run: Run): Start => toHauntingStart(run));

function toHauntingStart(run: Run): Start {
  if (run.state.phase.kind === 'haunting') {
    return { config: run.config, state: run.state, startedHere: false };
  }
  const setup = [
    { type: 'resume' },
    { type: 'ritualEnded' },
    { type: 'advance', dt: run.config.workIntervalMs },
  ] as const;
  let state = run.state;
  for (const event of setup) {
    state = reduce(state, event, run.config).state;
  }
  return { config: run.config, state, startedHere: true };
}

function hauntOf(s: SchedulerState): HauntPhase {
  if (s.phase.kind !== 'haunting') throw new Error('expected the schedule to stay in a Haunting');
  return s.phase;
}

/** The schedule time an advance step runs for, resolved against the state it runs from. */
function resolveAdvanceMs(s: SchedulerState, step: AdvanceStep): number {
  const h = hauntOf(s);
  let dt = step.amountMs;
  if (step.mode === 'snoozeEnd' && h.snoozeRemainingMs > 0) {
    dt = h.snoozeRemainingMs + step.offset;
  }
  if (step.mode === 'levelEdge' && s.ritual === null) {
    dt = h.escalationStepMs - (h.overdueMs % h.escalationStepMs) + step.offset;
  }
  return Math.min(Math.max(0, dt), MAX_ADVANCE_MS);
}

/** Replays `steps` from `start` and checks every rule of Property 8 after each step. */
function playSequence(start: Start, steps: readonly Step[]): void {
  const startHaunt = hauntOf(start.state);
  // The Haunting's snapshots, taken when it started (Design: a running Haunting keeps them).
  const snoozeMs = startHaunt.snoozeMs;
  const stepMs = startHaunt.escalationStepMs;
  const snoozesAtStart = startHaunt.snoozesUsed;
  // The Snooze_Duration is wall-clock time, so the schedule length is that time at the speed (Requirement 25.4).
  if (start.startedHere) expect(snoozeMs).toBe(start.config.snoozeMs * start.config.speed);

  let config = start.config;
  let state = start.state;
  // The same sequence with every snooze event removed.
  let reference = start.state;
  // Model of the current Snooze: whether one runs, and the schedule time it has taken so far.
  // A Snooze may already run in the start state, so the model begins from that state.
  let snoozeActive = startHaunt.snoozeRemainingMs > 0;
  let consumedMs = snoozeMs - startHaunt.snoozeRemainingMs;
  let accepted = 0;

  for (const step of steps) {
    const before = state;

    switch (step.kind) {
      case 'snooze': {
        const h = hauntOf(before);
        // A Snooze is accepted only with no Ritual, no running Snooze and fewer than three used (11.1, 11.8, 11.9).
        const accepts = h.snoozesUsed < SNOOZE_LIMIT && before.ritual === null && h.snoozeRemainingMs === 0;
        const res = reduce(before, { type: 'snooze' }, config);
        if (accepts) {
          expect(res.events).toEqual([{ type: 'snoozeStarted' }]);
          expect(hauntOf(res.state).snoozesUsed).toBe(h.snoozesUsed + 1);
          expect(hauntOf(res.state).snoozeRemainingMs).toBe(snoozeMs);
          accepted += 1;
          snoozeActive = true;
          consumedMs = 0;
        } else {
          // A rejected snooze, including the fourth in one Haunting, leaves the state unchanged.
          expect(res.events).toEqual([]);
          expect(res.state).toEqual(before);
        }
        state = res.state;
        break;
      }

      case 'advance': {
        const dt = resolveAdvanceMs(before, step);
        const res = reduce(before, { type: 'advance', dt }, config);
        const hb = hauntOf(before);
        const ha = hauntOf(res.state);
        // Only advance spends a Snooze, so the drop in its remaining time is the time the Snooze took.
        if (hb.snoozeRemainingMs > 0) consumedMs += hb.snoozeRemainingMs - ha.snoozeRemainingMs;
        expect(res.events.some((e) => e.type === 'snoozeStarted')).toBe(false);
        if (res.events.some((e) => e.type === 'snoozeEnded')) {
          // A Snooze that runs out lasts exactly the Snooze_Duration of the Haunting (11.1).
          expect(consumedMs).toBe(snoozeMs);
          snoozeActive = false;
        }
        state = res.state;
        reference = reduce(reference, { type: 'advance', dt }, config).state;
        break;
      }

      case 'ritualStarted': {
        const h = hauntOf(before);
        const offered = offeredRituals(h.breakType);
        const kind = offered[step.pick % offered.length];
        const res = reduce(before, { type: 'ritualStarted', kind, origin: 'haunting' }, config);
        if (before.ritual === null) {
          expect(res.state.ritual).toEqual({ kind, origin: 'haunting', breakType: h.breakType });
          // Ending a Snooze emits no snoozeEnded event (design, 15.2).
          expect(res.events).toEqual([]);
          if (snoozeActive) {
            // A Ritual ends the running Snooze early. The time it took stays below the full length (11.9).
            expect(consumedMs).toBeLessThan(snoozeMs);
            snoozeActive = false;
          }
        } else {
          expect(res.state).toEqual(before);
        }
        state = res.state;
        reference = reduce(reference, { type: 'ritualStarted', kind, origin: 'haunting' }, config).state;
        break;
      }

      case 'ritualEnded': {
        const res = reduce(before, { type: 'ritualEnded' }, config);
        expect(res.state.phase).toEqual(before.phase);
        expect(res.events).toEqual([]);
        state = res.state;
        reference = reduce(reference, { type: 'ritualEnded' }, config).state;
        break;
      }

      case 'configChanged': {
        const res = reduce(before, { type: 'configChanged', config: step.config }, step.config);
        // A running Haunting keeps its Snooze_Duration and Escalation_Step snapshots (Design, configChanged).
        expect(res.state.phase).toEqual(before.phase);
        expect(res.events).toEqual([]);
        config = step.config;
        state = res.state;
        reference = reduce(reference, { type: 'configChanged', config: step.config }, step.config).state;
        break;
      }
    }

    // Invariants that hold after every step.
    const h = hauntOf(state);
    const refH = hauntOf(reference);

    // The Overdue_Duration is that of the sequence with snooze events removed (11.3).
    expect(h.overdueMs).toBe(refH.overdueMs);

    // At most three accepted Snoozes per Haunting; the counter only grows (11.8, 11.9).
    expect(h.snoozesUsed).toBeLessThanOrEqual(SNOOZE_LIMIT);
    expect(h.snoozesUsed).toBe(snoozesAtStart + accepted);

    // Snapshots of the Haunting do not follow later configuration changes.
    expect(h.snoozeMs).toBe(snoozeMs);
    expect(h.escalationStepMs).toBe(stepMs);

    // The remaining Snooze time is the full length minus what the Snooze has taken, or zero after it ends (11.1).
    expect(h.snoozeRemainingMs).toBe(snoozeActive ? snoozeMs - consumedMs : 0);

    // The level and the displayed overdue come from the full Overdue_Duration, Snooze time included (11.2, 11.3).
    // The Snooze fields of the view are wall-clock milliseconds (25.4).
    expect(derive(state, config)).toMatchObject({
      phase: 'haunting',
      level: levelFor(refH.overdueMs, stepMs),
      overdueMs: refH.overdueMs,
      snoozesLeft: SNOOZE_LIMIT - h.snoozesUsed,
      snoozeMs: snoozeMs / config.speed,
      snoozeRemainingMs: Math.ceil(h.snoozeRemainingMs / config.speed),
    });
  }
}

describe('Property 8: Snooze is transparent to overdue accrual and limited to three', () => {
  it('keeps Overdue_Duration equal to the snooze-free sequence, caps accepted Snoozes at three per Haunting, keeps the Snooze length and the level from the full overdue', () => {
    const arbCase = arbHauntingStart.chain((start) =>
      fc
        .array(arbStepFor(start.config.speed), { minLength: 10, maxLength: 60 })
        .map((steps) => ({ start, steps })),
    );
    fc.assert(
      fc.property(arbCase, ({ start, steps }) => {
        playSequence(start, steps);
      }),
      { numRuns: 200 },
    );
  });
});
