import { describe, expect, it } from 'vitest';
import {
  BREATH_CYCLES,
  breathingGuide,
  breathingOutcome,
  breathingStep,
  startBreathing,
  type BreathingInput,
  type BreathingState,
} from '../src/core/rituals/breathing';

const press = (at: number, repeat?: boolean): BreathingInput => ({ type: 'press', at, repeat });
const release = (at: number): BreathingInput => ({ type: 'release', at });
const tick = (at: number): BreathingInput => ({ type: 'tick', at });
const hidden = (at: number): BreathingInput => ({ type: 'hidden', at });
const visible = (at: number): BreathingInput => ({ type: 'visible', at });

function run(state: BreathingState, inputs: readonly BreathingInput[]): BreathingState {
  return inputs.reduce((s, input) => breathingStep(s, input), state);
}

/** One counted hold of 4 s, starting at `at`. */
function countedHold(at: number): BreathingInput[] {
  return [press(at), release(at + 4_000)];
}

describe('startBreathing', () => {
  it('starts running with the guide in the inhale phase', () => {
    const state = startBreathing(1_000);
    expect(state.status).toBe('running');
    expect(state.validHolds).toBe(0);
    expect(breathingGuide(state)).toEqual({ phase: 'inhale', phaseElapsedMs: 0 });
    expect(breathingOutcome(state)).toEqual({ status: 'running', progress: 0 });
  });
});

describe('breathingGuide', () => {
  it('repeats the 4 s inhale and the 6 s exhale', () => {
    const start = startBreathing(0);
    const at = (ms: number) => breathingGuide(run(start, [tick(ms)]));
    expect(at(3_999)).toEqual({ phase: 'inhale', phaseElapsedMs: 3_999 });
    expect(at(4_000)).toEqual({ phase: 'exhale', phaseElapsedMs: 0 });
    expect(at(9_999)).toEqual({ phase: 'exhale', phaseElapsedMs: 5_999 });
    expect(at(10_000)).toEqual({ phase: 'inhale', phaseElapsedMs: 0 });
  });

  it('pauses the guide while the document is hidden', () => {
    const state = run(startBreathing(0), [tick(2_000), hidden(2_000), visible(50_000), tick(53_000)]);
    // 2 000 ms before the hide and 3 000 ms after the return: 5 000 ms in, so 1 000 ms into exhale.
    expect(breathingGuide(state)).toEqual({ phase: 'exhale', phaseElapsedMs: 1_000 });
  });
});

describe('counted holds', () => {
  it('counts a hold of 4 s as one breath cycle', () => {
    const state = run(startBreathing(0), [press(1_000), release(5_000)]);
    expect(state.validHolds).toBe(1);
    expect(breathingOutcome(state)).toEqual({ status: 'running', progress: 1 / BREATH_CYCLES });
  });

  it('counts holds of exactly 3 000 ms and 6 000 ms', () => {
    const state = run(startBreathing(0), [
      press(10_000),
      release(13_000),
      press(20_000),
      release(26_000),
    ]);
    expect(state.validHolds).toBe(2);
  });

  it('gives a pacing hint and does not count a hold shorter than 3 s', () => {
    const state = run(startBreathing(0), [press(0), release(2_999)]);
    expect(state.validHolds).toBe(0);
    expect(breathingOutcome(state)).toEqual({
      status: 'running',
      progress: 0,
      hint: 'holdTooShort',
    });
  });

  it('gives a pacing hint and does not count a hold longer than 6 s', () => {
    const state = run(startBreathing(0), [press(0), release(6_001)]);
    expect(state.validHolds).toBe(0);
    expect(breathingOutcome(state).hint).toBe('holdTooLong');
  });

  it('clears the pacing hint when the next hold is counted', () => {
    const state = run(startBreathing(0), [press(0), release(1_000), press(10_000), release(14_000)]);
    expect(state.validHolds).toBe(1);
    expect(breathingOutcome(state)).toEqual({ status: 'running', progress: 1 / BREATH_CYCLES });
  });
});

describe('exhale reminder', () => {
  it('excludes a press that starts less than 4 s after the previous release', () => {
    const state = run(startBreathing(0), [
      press(1_000),
      release(5_000),
      press(8_999),
      release(12_000),
    ]);
    expect(state.validHolds).toBe(1);
    expect(breathingOutcome(state).hint).toBe('exhaleReminder');
  });

  it('counts a press that starts exactly 4 s after the previous release', () => {
    const state = run(startBreathing(0), [press(1_000), release(5_000), press(9_000), release(12_000)]);
    expect(state.validHolds).toBe(2);
  });
});

describe('completion', () => {
  it('completes at the sixth counted hold', () => {
    const holds = Array.from({ length: BREATH_CYCLES }, (_, i) => countedHold(i * 10_000));
    const fifth = run(startBreathing(0), holds.slice(0, 5).flat());
    expect(breathingOutcome(fifth)).toEqual({ status: 'running', progress: 5 / BREATH_CYCLES });

    const done = run(startBreathing(0), holds.flat());
    expect(done.status).toBe('completed');
    expect(done.endedAt).toBe(54_000);
    expect(breathingOutcome(done)).toEqual({ status: 'completed', progress: 1 });
  });

  it('ignores input after completion', () => {
    const holds = Array.from({ length: BREATH_CYCLES }, (_, i) => countedHold(i * 10_000));
    const done = run(startBreathing(0), holds.flat());
    expect(breathingStep(done, tick(999_999))).toBe(done);
    expect(breathingStep(done, press(999_999))).toBe(done);
  });
});

describe('repeated key events', () => {
  it('keeps the original hold start when a repeat arrives during the hold', () => {
    // A repeat at 2 000 ms must not restart the hold. The hold is 4 000 ms and counts.
    const state = run(startBreathing(0), [press(0), press(2_000, true), release(4_000)]);
    expect(state.validHolds).toBe(1);
  });

  it('does not let repeats reset the 60 s idle limit on a stuck key', () => {
    const state = run(startBreathing(0), [press(0), press(30_000, true), press(59_000, true)]);
    expect(breathingStep(state, tick(60_000))).toMatchObject({ status: 'ended', endedAt: 60_000 });
  });
});

describe('idle limit', () => {
  it('ends without completion after 60 s with no press or release', () => {
    const state = run(startBreathing(0), [tick(60_000)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(60_000);
    expect(breathingOutcome(state)).toEqual({ status: 'ended', progress: 0 });
  });

  it('restarts the idle limit at each press and release', () => {
    const state = run(startBreathing(0), [press(50_000), release(52_000), tick(100_000)]);
    expect(state.status).toBe('running');
    // The idle limit runs from the release at 52 000 ms, so it ends at 112 000 ms.
    expect(breathingStep(state, tick(200_000))).toMatchObject({ status: 'ended', endedAt: 112_000 });
  });

  it('ends a stuck hold at 60 s and does not count it', () => {
    const state = run(startBreathing(0), [press(0), tick(60_000)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(60_000);
    expect(state.validHolds).toBe(0);
  });
});

describe('hidden document', () => {
  it('reports paused while hidden and does not credit hidden time to the idle limit', () => {
    const state = run(startBreathing(0), [hidden(2_000), visible(55_000)]);
    expect(state.status).toBe('running');
    // Idle is 2 000 ms when the document hides. The 53 000 ms hidden span adds nothing, so the
    // idle limit is reached 58 000 ms after the return, at 113 000 ms.
    expect(breathingStep(state, tick(112_999)).status).toBe('running');
    expect(breathingStep(state, tick(113_000))).toMatchObject({ status: 'ended', endedAt: 113_000 });
    expect(run(startBreathing(0), [hidden(2_000)]).status).toBe('paused');
  });

  it('ends without completion 60 s after hiding, stamped at hiddenAt + 60 s', () => {
    const state = run(startBreathing(0), [hidden(2_000), visible(200_000)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(62_000);
  });

  it('discards a hold in progress when the document hides', () => {
    const state = run(startBreathing(0), [press(1_000), hidden(3_000), visible(4_000), release(5_000)]);
    expect(state.validHolds).toBe(0);
    expect(state.holdStartedAt).toBeNull();
    expect(breathingOutcome(state).hint).toBeUndefined();
  });

  it('ignores a press while hidden', () => {
    const state = run(startBreathing(0), [hidden(1_000), press(2_000)]);
    expect(state.holdStartedAt).toBeNull();
    expect(state.status).toBe('paused');
  });
});
