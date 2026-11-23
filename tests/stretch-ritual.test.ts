import { describe, expect, it } from 'vitest';
import { RITUAL_HIDDEN_LIMIT_MS } from '../src/core/rituals/common';
import {
  STRETCH_CONTROL_LIMIT_MS,
  STRETCH_STEPS,
  STRETCH_STEP_MS,
  startStretch,
  stretchOutcome,
  stretchStep,
  type StretchInput,
  type StretchState,
} from '../src/core/rituals/stretch';

/** Runs a list of inputs from a fresh Stretch_Ritual that starts at time 0. */
function run(inputs: readonly StretchInput[], start = 0): StretchState {
  return inputs.reduce(stretchStep, startStretch(start));
}

const tick = (at: number): StretchInput => ({ type: 'tick', at });
const done = (at: number): StretchInput => ({ type: 'done', at });
const abandon = (at: number): StretchInput => ({ type: 'abandon', at });
const hidden = (at: number): StretchInput => ({ type: 'hidden', at });
const visible = (at: number): StretchInput => ({ type: 'visible', at });

describe('Stretch_Ritual steps (10.1)', () => {
  it('presents the four steps in the order neck tilt, shoulder roll, wrist and finger stretch, standing reach', () => {
    expect([...STRETCH_STEPS]).toEqual(['neckTilt', 'shoulderRoll', 'wristFinger', 'standingReach']);
  });

  it('starts on the first step with a 20 000 ms step countdown', () => {
    expect(STRETCH_STEP_MS).toBe(20_000);
    const state = startStretch(0);
    expect(state.stepIndex).toBe(0);
    expect(state.stepElapsedMs).toBe(0);
    expect(state.status).toBe('running');
  });
});

describe('Stretch_Ritual step countdown and completion control (10.3)', () => {
  it('keeps the completion control disabled at 19 999 ms and enables it at 20 000 ms', () => {
    const before = run([tick(19_999)]);
    expect(before.stepElapsedMs).toBe(19_999);
    expect(before.enabledMs).toBe(0);

    const at = run([tick(20_000)]);
    expect(at.stepElapsedMs).toBe(20_000);
    expect(at.status).toBe('running');
    expect(at.endedAt).toBeNull();
  });

  it('ignores done while the step countdown runs', () => {
    const state = run([tick(10_000), done(10_000)]);
    expect(state.stepIndex).toBe(0);
    expect(state.stepElapsedMs).toBe(10_000);
    expect(state.status).toBe('running');
  });

  it('credits a single tick that crosses the enable moment and keeps the control timer', () => {
    // 25 s in one span: the control was enabled at 20 s, so 5 s of control time is credited.
    const state = run([tick(25_000)]);
    expect(state.stepElapsedMs).toBe(20_000);
    expect(state.enabledMs).toBe(5_000);
  });
});

describe('Stretch_Ritual advancing (10.4, 10.5)', () => {
  it('advances from step 1, 2 and 3 when the enabled control is activated', () => {
    const second = run([tick(20_000), done(20_000)]);
    expect(second.stepIndex).toBe(1);
    expect(second.stepElapsedMs).toBe(0);
    expect(second.status).toBe('running');

    const third = run([tick(20_000), done(20_000), tick(40_000), done(40_000)]);
    expect(third.stepIndex).toBe(2);

    const fourth = run([tick(20_000), done(20_000), tick(40_000), done(40_000), tick(60_000), done(60_000)]);
    expect(fourth.stepIndex).toBe(3);
    expect(fourth.status).toBe('running');
  });

  it('restarts the 20 s countdown on each new step', () => {
    const state = run([tick(20_000), done(20_000), tick(30_000)]);
    expect(state.stepIndex).toBe(1);
    expect(state.stepElapsedMs).toBe(10_000);

    // The new step's control is not enabled yet at 39 999 ms.
    const notYet = run([tick(20_000), done(20_000), tick(39_999), done(39_999)]);
    expect(notYet.stepIndex).toBe(1);
  });

  it('completes the Stretch_Ritual when the fourth step control is activated', () => {
    const full = run([
      tick(20_000),
      done(20_000),
      tick(40_000),
      done(40_000),
      tick(60_000),
      done(60_000),
      tick(80_000),
      done(80_000),
    ]);
    expect(full.status).toBe('completed');
    expect(full.endedAt).toBe(80_000);
    expect(stretchOutcome(full)).toEqual({ status: 'completed', progress: 1 });
  });

  it('keeps a completed Ritual unchanged by later inputs', () => {
    const completed = run([tick(20_000), done(20_000), tick(40_000), done(40_000), tick(60_000), done(60_000), tick(80_000), done(80_000)]);
    expect(stretchStep(completed, tick(90_000))).toBe(completed);
    expect(stretchStep(completed, done(90_000))).toBe(completed);
  });
});

describe('Stretch_Ritual control timeout (10.6)', () => {
  it('keeps an enabled control running at 59 999 ms and ends it at 60 000 ms', () => {
    const almost = run([tick(20_000), tick(20_000 + STRETCH_CONTROL_LIMIT_MS - 1)]);
    expect(almost.status).toBe('running');
    expect(almost.enabledMs).toBe(STRETCH_CONTROL_LIMIT_MS - 1);

    const timedOut = run([tick(20_000), tick(20_000 + STRETCH_CONTROL_LIMIT_MS)]);
    expect(timedOut.status).toBe('ended');
    expect(timedOut.endedAt).toBe(20_000 + STRETCH_CONTROL_LIMIT_MS);
    expect(stretchOutcome(timedOut)).toEqual({ status: 'ended', progress: 0 });
  });

  it('stamps the timeout at the moment the control had been enabled for 60 s, even when the tick is late', () => {
    const late = run([tick(200_000)]);
    expect(late.status).toBe('ended');
    expect(late.endedAt).toBe(20_000 + STRETCH_CONTROL_LIMIT_MS);
  });

  it('carries the control time across several ticks', () => {
    // Enabled at 20 s. The control has 60 s, so it times out at 80 s.
    expect(run([tick(25_000), tick(79_999)]).status).toBe('running');
    const ended = run([tick(25_000), tick(79_999), tick(80_000)]);
    expect(ended.status).toBe('ended');
    expect(ended.endedAt).toBe(80_000);
  });

  it('does not time out a control that is activated just before the limit', () => {
    const state = run([tick(20_000), done(79_999)]);
    expect(state.status).toBe('running');
    expect(state.stepIndex).toBe(1);
  });
});

describe('Stretch_Ritual abandon (7.5)', () => {
  it('ends on Abandon and reports zero progress', () => {
    const state = run([tick(5_000), abandon(7_000)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(7_000);
    expect(stretchOutcome(state)).toEqual({ status: 'ended', progress: 0 });
  });

  it('keeps an ended Ritual unchanged by later inputs', () => {
    const ended = run([abandon(4_000)]);
    expect(stretchStep(ended, tick(20_000))).toBe(ended);
  });
});

describe('Stretch_Ritual progress (4.11)', () => {
  it('reports (stepIndex + stepElapsed / 20 s) / 4 while running', () => {
    expect(stretchOutcome(run([tick(10_000)]))).toEqual({ status: 'running', progress: 0.125 });
    expect(stretchOutcome(run([tick(20_000), done(20_000), tick(30_000)]))).toEqual({
      status: 'running',
      progress: 0.375,
    });
  });

  it('reports the completed fraction of a step whose control is enabled', () => {
    expect(stretchOutcome(run([tick(20_000)])).progress).toBe(0.25);
  });
});

describe('Stretch_Ritual backward timestamps', () => {
  it('ignores a backward timestamp and adds no step time', () => {
    const state = run([tick(10_000), tick(5_000)]);
    expect(state.stepElapsedMs).toBe(10_000);
    expect(state.status).toBe('running');
  });
});

describe('Stretch_Ritual hidden document (7.7, 7.8)', () => {
  it('pauses the step countdown while hidden', () => {
    const state = run([tick(5_000), hidden(5_000), tick(50_000)]);
    expect(state.status).toBe('paused');
    expect(state.stepElapsedMs).toBe(5_000);
  });

  it('resumes the step countdown from where it paused', () => {
    const state = run([tick(5_000), hidden(5_000), visible(50_000), tick(65_000)]);
    // 5 s before hiding plus 15 s after the document became visible again.
    expect(state.status).toBe('running');
    expect(state.stepElapsedMs).toBe(20_000);
  });

  it('pauses the control timer while hidden', () => {
    // Enabled at 20 s, hidden at 30 s (10 s of control time), visible at 80 s.
    const state = run([tick(20_000), hidden(30_000), visible(80_000), tick(129_999)]);
    expect(state.status).toBe('running');
    expect(state.enabledMs).toBe(59_999);

    const timedOut = run([tick(20_000), hidden(30_000), visible(80_000), tick(130_000)]);
    expect(timedOut.status).toBe('ended');
    expect(timedOut.endedAt).toBe(130_000);
  });

  it('keeps the Ritual running when the document is hidden for 59 999 ms', () => {
    const state = run([hidden(1_000), visible(1_000 + RITUAL_HIDDEN_LIMIT_MS - 1)]);
    expect(state.status).toBe('running');
  });

  it('ends without completion when the document is hidden for 60 000 ms', () => {
    const state = run([hidden(1_000), tick(1_000 + RITUAL_HIDDEN_LIMIT_MS)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(1_000 + RITUAL_HIDDEN_LIMIT_MS);
  });

  it('stamps the timeout at hiddenAt + 60 s even when the user returns much later', () => {
    const state = run([hidden(1_000), visible(300_000)]);
    expect(state.status).toBe('ended');
    expect(state.endedAt).toBe(1_000 + RITUAL_HIDDEN_LIMIT_MS);
  });

  it('ignores done and abandon while hidden', () => {
    const state = run([tick(20_000), hidden(20_000), done(21_000), abandon(22_000)]);
    expect(state.status).toBe('paused');
    expect(state.stepIndex).toBe(0);
  });
});
