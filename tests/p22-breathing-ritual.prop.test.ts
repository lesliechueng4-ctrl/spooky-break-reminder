// **Feature: spooky-break-reminder, Property 22: Breathing_Ritual model**
// **Validates: Requirements 9.1, 9.5, 9.6, 9.7, 9.8, 29.7**
//
// For any sequence of press and release timestamps, the breath cycle count equals the number of holds
// lasting 3 to 6 seconds that started at least 4 seconds after the previous release (or are the first
// hold), the Ritual completes exactly at the sixth such hold, and the guide phase at time t is inhale
// when t mod 10 s < 4 s and exhale otherwise.
//
// The real `breathingStep` runs in lockstep with a reference model that is written here, separately from
// breathing.ts. The model also covers the 60 s idle limit (9.9), so a sequence that ends the Ritual by
// inactivity is still checked. Ticks are mixed into the sequences so that the guide is checked at times
// that are not press or release times.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  BREATH_CYCLES,
  BREATHING_IDLE_LIMIT_MS,
  EXHALE_GAP_MS,
  GUIDE_CYCLE_MS,
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  INHALE_MS,
  breathingGuide,
  breathingStep,
  startBreathing,
  type BreathingInput,
} from '../src/core/rituals/breathing';

type StepKind = 'press' | 'release' | 'tick';

/** One input, with the time in milliseconds after the previous input. */
interface Step {
  readonly kind: StepKind;
  readonly dt: number;
}

/** One input at an absolute monotonic time. */
interface Timed {
  readonly kind: StepKind;
  readonly at: number;
}

/** Reference model state: the Ritual rules restated without the shared Ritual helpers. */
interface Model {
  readonly status: 'running' | 'completed' | 'ended';
  readonly valid: number;
  /** Start of the hold that is in progress, or null when no hold is active. */
  readonly holdStart: number | null;
  /** True when the active hold started less than 4 s after the previous release. */
  readonly excluded: boolean;
  /** Time of the most recent release that closed a hold, or null before the first one. */
  readonly lastRelease: number | null;
  /** Time of the most recent press or release that the Ritual accepted. Idle counts from here. */
  readonly lastSuccess: number;
  readonly endedAt: number | null;
}

/** A hold with optional tick inside it, used to build well-formed press and release sequences. */
interface HoldPlan {
  readonly hold: number;
  readonly gap: number;
  readonly tickInside: boolean;
}

/**
 * Hold lengths biased to the 3 to 6 s boundaries (9.5, 9.6). Lengths of 0 to 12 s cover the
 * rest of the range, so pacing hints are exercised too.
 */
const arbHold: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(HOLD_MIN_MS - 1, HOLD_MIN_MS, HOLD_MAX_MS, HOLD_MAX_MS + 1) },
  { weight: 2, arbitrary: fc.integer({ min: HOLD_MIN_MS, max: HOLD_MAX_MS }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 12_000 }) },
);

/** Gap from one release to the next press, biased to the 4 s exhale reminder boundary (9.7). */
const arbGap: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(0, EXHALE_GAP_MS - 1, EXHALE_GAP_MS, EXHALE_GAP_MS + 1) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 12_000 }) },
);

/** Single timing deltas for unstructured sequences, including the 60 s idle limit (9.9). */
const arbDelta: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      0,
      1,
      HOLD_MIN_MS,
      HOLD_MAX_MS,
      EXHALE_GAP_MS,
      INHALE_MS,
      GUIDE_CYCLE_MS,
      BREATHING_IDLE_LIMIT_MS - 1,
      BREATHING_IDLE_LIMIT_MS,
      BREATHING_IDLE_LIMIT_MS + 1,
    ),
  },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 12_000 }) },
);

const arbHoldPlan: fc.Arbitrary<HoldPlan> = fc.record({
  hold: arbHold,
  gap: arbGap,
  tickInside: fc.boolean(),
});

/** Turns hold plans into press, optional tick and release steps. Every press is preceded by its gap. */
function toHoldSteps(plans: readonly HoldPlan[]): Step[] {
  const steps: Step[] = [];
  let gapBefore = 0;
  for (const plan of plans) {
    steps.push({ kind: 'press', dt: gapBefore });
    if (plan.tickInside) {
      const half = Math.floor(plan.hold / 2);
      steps.push({ kind: 'tick', dt: half });
      steps.push({ kind: 'release', dt: plan.hold - half });
    } else {
      steps.push({ kind: 'release', dt: plan.hold });
    }
    gapBefore = plan.gap;
  }
  return steps;
}

/** Well-formed hold sequences, which often complete the Ritual. */
const arbStructured: fc.Arbitrary<Step[]> = fc
  .array(arbHoldPlan, { minLength: 0, maxLength: 12 })
  .map(toHoldSteps);

/** Unstructured press, release and tick sequences, which include orphan releases and repeated presses. */
const arbUnstructured: fc.Arbitrary<Step[]> = fc.array(
  fc.record({
    kind: fc.constantFrom<StepKind>('press', 'release', 'tick'),
    dt: arbDelta,
  }),
  { minLength: 0, maxLength: 80 },
);

const arbCase = fc.record({
  start: fc.integer({ min: 0, max: 1_000_000_000 }),
  steps: fc.oneof(arbStructured, arbUnstructured),
});

function toTimed(start: number, steps: readonly Step[]): Timed[] {
  let at = start;
  return steps.map((step) => {
    at += step.dt;
    return { kind: step.kind, at };
  });
}

function toInput(ev: Timed): BreathingInput {
  switch (ev.kind) {
    case 'press':
      return { type: 'press', at: ev.at };
    case 'release':
      return { type: 'release', at: ev.at };
    case 'tick':
      return { type: 'tick', at: ev.at };
  }
}

function startModel(start: number): Model {
  return {
    status: 'running',
    valid: 0,
    holdStart: null,
    excluded: false,
    lastRelease: null,
    lastSuccess: start,
    endedAt: null,
  };
}

/**
 * Reference step. The idle limit applies to every input: once the time since the last accepted press
 * or release reaches the limit, the Ritual ends at that moment. A press during an active hold, and a
 * release with no active hold, are ignored.
 */
function modelStep(m: Model, ev: Timed): Model {
  if (m.status !== 'running') return m;

  const idleEnd = m.lastSuccess + BREATHING_IDLE_LIMIT_MS;
  if (ev.at >= idleEnd) return { ...m, status: 'ended', endedAt: idleEnd };

  if (ev.kind === 'tick') return m;

  if (ev.kind === 'press') {
    if (m.holdStart !== null) return m;
    const excluded = m.lastRelease !== null && ev.at - m.lastRelease < EXHALE_GAP_MS;
    return { ...m, holdStart: ev.at, excluded, lastSuccess: ev.at };
  }

  if (m.holdStart === null) return m;
  const held = ev.at - m.holdStart;
  const counted = !m.excluded && held >= HOLD_MIN_MS && held <= HOLD_MAX_MS;
  const valid = m.valid + (counted ? 1 : 0);
  const next: Model = {
    ...m,
    valid,
    holdStart: null,
    excluded: false,
    lastRelease: ev.at,
    lastSuccess: ev.at,
  };
  return valid >= BREATH_CYCLES ? { ...next, status: 'completed', endedAt: ev.at } : next;
}

describe('Property 22: Breathing_Ritual model', () => {
  it('matches the reference model at every input and the guide phase at each processed time', () => {
    fc.assert(
      fc.property(arbCase, ({ start, steps }) => {
        const events = toTimed(start, steps);
        let real = startBreathing(start);
        let model = startModel(start);

        for (const ev of events) {
          const before = real;
          real = breathingStep(real, toInput(ev));
          model = modelStep(model, ev);

          // Same status and count after every input. This pins the completion to the sixth counted hold.
          expect(real.status).toBe(model.status);
          expect(real.validHolds).toBe(model.valid);
          expect(real.validHolds).toBeLessThanOrEqual(BREATH_CYCLES);
          if (model.endedAt !== null) expect(real.endedAt).toBe(model.endedAt);

          // An input that the Ritual processed leaves guideMs at the time since the start.
          // A completion or idle end that stops the Ritual at an earlier time is not checked here.
          if (before.status === 'running' && real.status !== 'ended') {
            const t = ev.at - start;
            expect(real.guideMs).toBe(t);

            const cycleMs = t % GUIDE_CYCLE_MS;
            const inhale = cycleMs < INHALE_MS;
            const guide = breathingGuide(real);
            expect(guide.phase).toBe(inhale ? 'inhale' : 'exhale');
            expect(guide.phaseElapsedMs).toBe(inhale ? cycleMs : cycleMs - INHALE_MS);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
