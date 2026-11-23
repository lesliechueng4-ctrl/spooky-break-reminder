import { describe, expect, it } from 'vitest';
import { RITUAL_HIDDEN_LIMIT_MS } from '../src/core/rituals/common';
import { EYE_DURATION_MS, eyeOutcome, eyeStep, startEye, type EyeInput, type EyeState } from '../src/core/rituals/eye';

/** Runs a list of inputs from a fresh Eye_Ritual that starts at time 0. */
function run(inputs: readonly EyeInput[], start = 0): EyeState {
  return inputs.reduce(eyeStep, startEye(start));
}

const tick = (at: number): EyeInput => ({ type: 'tick', at });
const hidden = (at: number): EyeInput => ({ type: 'hidden', at });
const visible = (at: number): EyeInput => ({ type: 'visible', at });
const press = (at: number, onAbandon = false): EyeInput => ({ type: 'input', at, onAbandon });
const key = (at: number, k: string, onAbandon = false): EyeInput => ({ type: 'input', at, onAbandon, key: k });

describe('Eye_Ritual countdown (8.2, 8.6)', () => {
  it('has a 20 000 ms countdown', () => {
    expect(EYE_DURATION_MS).toBe(20_000);
  });

  it('stays running one millisecond before 20 s and completes at exactly 20 s', () => {
    const before = run([tick(19_999)]);
    expect(before.status).toBe('running');
    expect(before.elapsedMs).toBe(19_999);

    const at = run([tick(20_000)]);
    expect(at.status).toBe('completed');
    expect(at.endedAt).toBe(20_000);
    expect(eyeOutcome(at)).toEqual({ status: 'completed', progress: 1 });
  });

  it('stamps completion at the moment of zero when the tick arrives late', () => {
    const state = run([tick(25_000)]);
    expect(state.status).toBe('completed');
    expect(state.endedAt).toBe(20_000);
  });

  it('ignores a backward timestamp and adds no countdown time', () => {
    const state = run([tick(10_000), tick(5_000)]);
    expect(state.status).toBe('running');
    expect(state.elapsedMs).toBe(10_000);
    expect(run([tick(10_000), tick(5_000), tick(20_000)]).status).toBe('completed');
  });

  it('reports progress as elapsed over 20 s while running', () => {
    expect(eyeOutcome(run([tick(5_000)]))).toEqual({ status: 'running', progress: 0.25 });
  });

  it('keeps a completed Ritual unchanged by later inputs', () => {
    const done = run([tick(20_000)]);
    expect(eyeStep(done, press(21_000))).toBe(done);
    expect(eyeStep(done, tick(30_000))).toBe(done);
  });
});

describe('Eye_Ritual restart input (8.4)', () => {
  it('restarts the countdown on a pointer press outside Abandon', () => {
    const state = run([press(15_000), tick(34_999)]);
    expect(state.status).toBe('running');
    expect(state.elapsedMs).toBe(19_999);
    expect(run([press(15_000), tick(35_000)]).status).toBe('completed');
  });

  it('restarts the countdown on a key other than Escape', () => {
    expect(run([key(15_000, 'a'), tick(35_000)]).status).toBe('completed');
    expect(run([key(15_000, 'a'), tick(34_999)]).status).toBe('running');
  });

  it('restarts on Enter and Space on the Ritual surface outside Abandon', () => {
    expect(run([key(10_000, 'Enter'), tick(29_999)]).status).toBe('running');
    expect(run([key(10_000, ' '), tick(30_000)]).status).toBe('completed');
  });

  it('does not restart or end on Tab or Shift on the focused Abandon button', () => {
    // Focus keys change nothing, so the countdown keeps its elapsed time.
    const tab = run([key(10_000, 'Tab', true)]);
    expect(tab.status).toBe('running');
    expect(tab.elapsedMs).toBe(10_000);

    const shift = run([key(10_000, 'Shift', true), tick(20_000)]);
    expect(shift.status).toBe('completed');
    expect(shift.endedAt).toBe(20_000);
  });
});

describe('Eye_Ritual abandon (7.5)', () => {
  it('ends on a pointer press on the Abandon control and reports zero progress', () => {
    const state = run([tick(5_000), press(7_000, true)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(7_000);
    expect(eyeOutcome(state)).toEqual({ status: 'ended', progress: 0 });
  });

  it('ends on Enter and Space on the focused Abandon control', () => {
    expect(run([key(3_000, 'Enter', true)]).status).toBe('ended');
    expect(run([key(3_000, ' ', true)]).status).toBe('ended');
  });

  it('ends on Escape from the surface and from the Abandon control', () => {
    expect(run([key(4_000, 'Escape')]).status).toBe('ended');
    expect(run([key(4_000, 'Escape', true)]).status).toBe('ended');
  });

  it('keeps an ended Ritual unchanged by later inputs', () => {
    const ended = run([press(4_000, true)]);
    expect(eyeStep(ended, tick(20_000))).toBe(ended);
  });
});

describe('Eye_Ritual hidden document (7.7, 7.8)', () => {
  it('pauses while hidden and does not count hidden time', () => {
    const paused = run([tick(5_000), hidden(5_000)]);
    expect(paused.status).toBe('paused');

    const back = run([hidden(5_000), visible(50_000), tick(65_000)]);
    // 5 s before hiding plus 15 s after the document became visible again.
    expect(back.status).toBe('completed');
    expect(back.endedAt).toBe(65_000);
  });

  it('keeps the countdown running when the document is hidden for 59 999 ms', () => {
    const state = run([hidden(1_000), visible(1_000 + RITUAL_HIDDEN_LIMIT_MS - 1)]);
    expect(state.status).toBe('running');
  });

  it('ends without completion when the document is hidden for 60 000 ms', () => {
    const state = run([hidden(1_000), tick(1_000 + RITUAL_HIDDEN_LIMIT_MS)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(1_000 + RITUAL_HIDDEN_LIMIT_MS);
    expect(eyeOutcome(state).progress).toBe(0);
  });

  it('stamps the timeout at hiddenAt + 60 s even when the user returns much later', () => {
    const state = run([hidden(1_000), visible(300_000)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(1_000 + RITUAL_HIDDEN_LIMIT_MS);
  });

  it('does not restart the 60 s limit when hidden is reported again', () => {
    const state = run([hidden(1_000), hidden(30_000), tick(1_000 + RITUAL_HIDDEN_LIMIT_MS)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(1_000 + RITUAL_HIDDEN_LIMIT_MS);
  });

  it('ignores input while hidden', () => {
    const state = run([hidden(1_000), press(2_000, true)]);
    expect(state.status).toBe('paused');
  });
});
