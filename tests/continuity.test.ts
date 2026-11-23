import { describe, expect, it } from 'vitest';
import { type GapInput, classifyGap } from '../src/core/continuity';
import {
  GAP_TOLERANCE_MS,
  MINUTE_MS,
  SUSPEND_EVIDENCE_MS,
  UNOBSERVED_GAP_LIMIT_MS,
} from '../src/core/time';

const NATURAL_BREAK_MS = 5 * MINUTE_MS;

function input(overrides: Partial<GapInput> = {}): GapInput {
  return {
    gapWallMs: 0,
    gapMonoMs: null,
    naturalBreakWallMs: NATURAL_BREAK_MS,
    intervention: 'none',
    awayOpen: false,
    ...overrides,
  };
}

describe('classifyGap rule 1: backward step', () => {
  it('adds zero for a negative gap', () => {
    expect(classifyGap(input({ gapWallMs: -1 }))).toEqual({ kind: 'backward' });
  });

  it('takes precedence over every other evidence', () => {
    expect(
      classifyGap(
        input({ gapWallMs: -NATURAL_BREAK_MS * 10, gapMonoMs: 0, intervention: 'discarded', awayOpen: true }),
      ),
    ).toEqual({ kind: 'backward' });
  });
});

describe('classifyGap rule 2: continuous running time', () => {
  it('counts a zero gap as continuous', () => {
    expect(classifyGap(input({ gapWallMs: 0 }))).toEqual({ kind: 'continuous', elapsedWallMs: 0 });
  });

  it('counts a gap exactly at the Gap_Tolerance as continuous', () => {
    expect(classifyGap(input({ gapWallMs: GAP_TOLERANCE_MS }))).toEqual({
      kind: 'continuous',
      elapsedWallMs: GAP_TOLERANCE_MS,
    });
  });

  it('stops being continuous one millisecond above the Gap_Tolerance', () => {
    expect(classifyGap(input({ gapWallMs: GAP_TOLERANCE_MS + 1 })).kind).not.toBe('continuous');
  });
});

describe('classifyGap rule 3: open absence', () => {
  it('returns awayContinues for a long gap that began with an open absence', () => {
    expect(classifyGap(input({ gapWallMs: 2 * NATURAL_BREAK_MS, awayOpen: true }))).toEqual({
      kind: 'awayContinues',
      elapsedWallMs: 2 * NATURAL_BREAK_MS,
    });
  });

  it('is not overridden by suspend evidence or an intervention', () => {
    expect(
      classifyGap(input({ gapWallMs: 10 * NATURAL_BREAK_MS, gapMonoMs: 0, intervention: 'frozen', awayOpen: true })),
    ).toEqual({ kind: 'awayContinues', elapsedWallMs: 10 * NATURAL_BREAK_MS });
  });

  it('does not apply to a gap within the Gap_Tolerance', () => {
    expect(classifyGap(input({ gapWallMs: 1_000, awayOpen: true })).kind).toBe('continuous');
  });
});

describe('classifyGap rule 4: Suspend_Evidence', () => {
  it('is away when the gap is at least Natural_Break_Duration', () => {
    const gap = NATURAL_BREAK_MS;
    expect(classifyGap(input({ gapWallMs: gap, gapMonoMs: gap - SUSPEND_EVIDENCE_MS }))).toEqual({
      kind: 'away',
      awayWallMs: gap,
      reason: 'suspend',
    });
  });

  it('is elapsed when the gap is below Natural_Break_Duration', () => {
    const gap = NATURAL_BREAK_MS - 1;
    expect(classifyGap(input({ gapWallMs: gap, gapMonoMs: 0 }))).toEqual({
      kind: 'elapsed',
      elapsedWallMs: gap,
      reason: 'short',
    });
  });

  it('needs the wall clock to lead the monotonic clock by SUSPEND_EVIDENCE_MS', () => {
    const gap = NATURAL_BREAK_MS + 1;
    // Lead of 29 999 ms: no suspend evidence, so rule 6 applies with reason no-signal.
    expect(classifyGap(input({ gapWallMs: gap, gapMonoMs: gap - SUSPEND_EVIDENCE_MS + 1 }))).toEqual({
      kind: 'away',
      awayWallMs: gap,
      reason: 'no-signal',
    });
    // Lead of exactly 30 000 ms: suspend evidence.
    expect(classifyGap(input({ gapWallMs: gap, gapMonoMs: gap - SUSPEND_EVIDENCE_MS }))).toEqual({
      kind: 'away',
      awayWallMs: gap,
      reason: 'suspend',
    });
  });

  it('is not applied when gapMonoMs is null (the page was reloaded)', () => {
    expect(classifyGap(input({ gapWallMs: 10 * MINUTE_MS, gapMonoMs: null }))).toEqual({
      kind: 'away',
      awayWallMs: 10 * MINUTE_MS,
      reason: 'no-signal',
    });
  });

  it('takes precedence over an Intervention_Signal', () => {
    expect(classifyGap(input({ gapWallMs: NATURAL_BREAK_MS, gapMonoMs: 0, intervention: 'frozen' }))).toEqual({
      kind: 'away',
      awayWallMs: NATURAL_BREAK_MS,
      reason: 'suspend',
    });
  });
});

describe('classifyGap rule 5: Intervention_Signal within the Unobserved_Gap_Limit', () => {
  it('counts a frozen gap as elapsed time', () => {
    const gap = 30 * MINUTE_MS;
    expect(classifyGap(input({ gapWallMs: gap, intervention: 'frozen' }))).toEqual({
      kind: 'elapsed',
      elapsedWallMs: gap,
      reason: 'frozen',
    });
  });

  it('counts a discarded gap as elapsed time', () => {
    const gap = 25 * MINUTE_MS;
    expect(classifyGap(input({ gapWallMs: gap, intervention: 'discarded' }))).toEqual({
      kind: 'elapsed',
      elapsedWallMs: gap,
      reason: 'discarded',
    });
  });

  it('still applies at exactly the Unobserved_Gap_Limit', () => {
    expect(classifyGap(input({ gapWallMs: UNOBSERVED_GAP_LIMIT_MS, intervention: 'discarded' }))).toEqual({
      kind: 'elapsed',
      elapsedWallMs: UNOBSERVED_GAP_LIMIT_MS,
      reason: 'discarded',
    });
  });

  it('does not apply when the browser reports no intervention', () => {
    expect(classifyGap(input({ gapWallMs: 30 * MINUTE_MS, intervention: 'none' })).kind).toBe('away');
  });
});

describe('classifyGap rule 6: long gap with no usable evidence', () => {
  it('is away with reason no-signal when no intervention is reported', () => {
    expect(classifyGap(input({ gapWallMs: NATURAL_BREAK_MS }))).toEqual({
      kind: 'away',
      awayWallMs: NATURAL_BREAK_MS,
      reason: 'no-signal',
    });
  });

  it('is away with reason over-limit when an intervention exceeds the Unobserved_Gap_Limit', () => {
    const gap = UNOBSERVED_GAP_LIMIT_MS + 1;
    expect(classifyGap(input({ gapWallMs: gap, intervention: 'frozen' }))).toEqual({
      kind: 'away',
      awayWallMs: gap,
      reason: 'over-limit',
    });
  });

  it('is away over the limit for a discard after a night away', () => {
    const gap = 8 * 60 * MINUTE_MS;
    expect(classifyGap(input({ gapWallMs: gap, intervention: 'discarded' }))).toEqual({
      kind: 'away',
      awayWallMs: gap,
      reason: 'over-limit',
    });
  });

  it('is away at exactly Natural_Break_Duration', () => {
    expect(classifyGap(input({ gapWallMs: NATURAL_BREAK_MS }))).toMatchObject({ kind: 'away' });
  });
});

describe('classifyGap rule 7: short gap with no evidence', () => {
  it('is elapsed when a reload occurs after a gap just above the Gap_Tolerance', () => {
    expect(classifyGap(input({ gapWallMs: GAP_TOLERANCE_MS + 1 }))).toEqual({
      kind: 'elapsed',
      elapsedWallMs: GAP_TOLERANCE_MS + 1,
      reason: 'short',
    });
  });

  it('is elapsed one millisecond below Natural_Break_Duration', () => {
    expect(classifyGap(input({ gapWallMs: NATURAL_BREAK_MS - 1 }))).toEqual({
      kind: 'elapsed',
      elapsedWallMs: NATURAL_BREAK_MS - 1,
      reason: 'short',
    });
  });
});

describe('classifyGap input validation', () => {
  it('rejects a fractional gapWallMs', () => {
    expect(() => classifyGap(input({ gapWallMs: 1.5 }))).toThrow(RangeError);
  });

  it('rejects a fractional gapMonoMs', () => {
    expect(() => classifyGap(input({ gapWallMs: 1_000, gapMonoMs: 0.5 }))).toThrow(RangeError);
  });

  it('rejects a fractional naturalBreakWallMs', () => {
    expect(() => classifyGap(input({ gapWallMs: 1_000, naturalBreakWallMs: 60_000.5 }))).toThrow(RangeError);
  });
});
