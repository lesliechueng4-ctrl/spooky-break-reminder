import { describe, expect, it } from 'vitest';
import { countFlashes, JUMP_SCARE_TOTAL_MS } from '../src/core/flashGuard';
import {
  type ChannelSpec,
  compositeLuminance,
  createAnimator,
  DISSOLVE_TRANSITION_MS,
  JUMP_SCARE_LUMINANCE,
  jumpScareEnvelope,
  LEVEL_TRANSITION_MS,
} from '../src/effects/animator';

/** A fake clock and frame queue. Frames run only when requested, every 16 ms of fake time. */
function fakeFrames(specs: ChannelSpec[]) {
  let now = 0;
  let visible = true;
  let nextHandle = 1;
  const queued = new Map<number, () => void>();
  let requests = 0;
  let framesRun = 0;
  const trace: Array<{ t: number; lum: number }> = [];
  const animator = createAnimator(specs, {
    now: () => now,
    isVisible: () => visible,
    requestFrame: (callback) => {
      requests++;
      const handle = nextHandle++;
      queued.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      queued.delete(handle);
    },
    onFrame: () => {
      framesRun++;
      trace.push({ t: now, lum: compositeLuminance(animator.values()) });
    },
  });
  return {
    animator,
    /** Advances fake time by `ms`, running each queued frame at its 16 ms tick. */
    advance(ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) {
        now += 16;
        const callbacks = [...queued.values()];
        queued.clear();
        for (const callback of callbacks) callback();
      }
    },
    setVisible(value: boolean) {
      visible = value;
    },
    now: () => now,
    requests: () => requests,
    framesRun: () => framesRun,
    trace,
  };
}

const veilSpec: ChannelSpec[] = [{ name: 'veil', kind: 'opacity', initial: 0 }];

describe('transition durations', () => {
  it('uses at least 1 s for a level increase and at most 3 s for the dissolve', () => {
    expect(LEVEL_TRANSITION_MS).toBeGreaterThanOrEqual(1_000);
    expect(DISSOLVE_TRANSITION_MS).toBeLessThanOrEqual(3_000);
  });
});

describe('easing', () => {
  it('eases a level increase over its duration and lands exactly on the target', () => {
    const clock = fakeFrames(veilSpec);
    clock.animator.setTargets({ veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.advance(600);
    const midway = clock.animator.values()['veil']!;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(0.3);
    while (clock.now() < LEVEL_TRANSITION_MS - 16) clock.advance(16);
    expect(clock.animator.values()['veil']).toBeLessThan(0.3);
    while (clock.now() < LEVEL_TRANSITION_MS) clock.advance(16);
    expect(clock.animator.values()['veil']).toBe(0.3);
  });

  it('snaps to the target when the duration is zero', () => {
    const clock = fakeFrames(veilSpec);
    clock.animator.setTargets({ veil: 0.5 }, 0);
    clock.advance(16);
    expect(clock.animator.values()['veil']).toBe(0.5);
  });

  it('rejects a non-integer duration and an unknown channel', () => {
    const clock = fakeFrames(veilSpec);
    expect(() => clock.animator.setTargets({ veil: 0.1 }, 1.5)).toThrow(RangeError);
    expect(() => clock.animator.setTargets({ unknown: 0.1 }, 100)).toThrow(RangeError);
  });
});

describe('frame scheduling', () => {
  it('requests no animation frame while the document is hidden (19.10)', () => {
    const clock = fakeFrames(veilSpec);
    clock.setVisible(false);
    clock.animator.setTargets({ veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.advance(2_000);
    expect(clock.requests()).toBe(0);
    expect(clock.framesRun()).toBe(0);
  });

  it('resumes with one frame when the document becomes visible again', () => {
    const clock = fakeFrames(veilSpec);
    clock.setVisible(false);
    clock.animator.setTargets({ veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.setVisible(true);
    clock.animator.notifyVisibility();
    clock.advance(LEVEL_TRANSITION_MS + 32);
    expect(clock.animator.values()['veil']).toBe(0.3);
  });

  it('stops frames when the document is hidden during a transition', () => {
    const clock = fakeFrames(veilSpec);
    clock.animator.setTargets({ veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.advance(200);
    clock.setVisible(false);
    clock.animator.notifyVisibility();
    const framesBefore = clock.framesRun();
    clock.advance(2_000);
    expect(clock.framesRun()).toBe(framesBefore);
  });

  it('requests no frames once every channel has settled', () => {
    const clock = fakeFrames(veilSpec);
    clock.animator.setTargets({ veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.advance(LEVEL_TRANSITION_MS + 100);
    const requestsWhenSettled = clock.requests();
    clock.advance(5_000);
    expect(clock.requests()).toBe(requestsWhenSettled);
  });
});

describe('Reduced_Motion', () => {
  const specs: ChannelSpec[] = [
    { name: 'fogScale', kind: 'geometry', initial: 1.65 },
    { name: 'veil', kind: 'opacity', initial: 0 },
  ];

  it('snaps geometry channels to their target and keeps opacity transitions (19.3)', () => {
    const clock = fakeFrames(specs);
    clock.animator.setReducedMotion(true);
    clock.animator.setTargets({ fogScale: 1, veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.advance(16);
    expect(clock.animator.values()['fogScale']).toBe(1);
    const veil = clock.animator.values()['veil']!;
    expect(veil).toBeGreaterThan(0);
    expect(veil).toBeLessThan(0.3);
  });

  it('snaps a geometry channel that is already moving when Reduced_Motion turns on', () => {
    const clock = fakeFrames(specs);
    clock.animator.setTargets({ fogScale: 1 }, LEVEL_TRANSITION_MS);
    clock.advance(200);
    clock.animator.setReducedMotion(true);
    clock.advance(16);
    expect(clock.animator.values()['fogScale']).toBe(1);
  });
});

describe('Flash_Guard', () => {
  it('keeps the displayed luminance at no more than 3 Flashes in any 1 s window (19.4)', () => {
    const specs: ChannelSpec[] = [
      { name: 'veil', kind: 'opacity', initial: 0 },
      { name: 'fogOpacity', kind: 'opacity', initial: 0 },
      { name: 'fogScale', kind: 'geometry', initial: 1 },
    ];
    const clock = fakeFrames(specs);
    // Targets flip every 50 ms, which would produce a flash every 100 ms without the guard.
    for (let step = 0; step < 200; step++) {
      const dark = step % 2 === 0;
      clock.animator.setTargets({ veil: dark ? 0.6 : 0, fogOpacity: dark ? 1 : 0 }, LEVEL_TRANSITION_MS);
      clock.advance(50);
    }
    clock.advance(2_000);
    expect(countFlashes(clock.trace, 1_000)).toBeLessThanOrEqual(3);
  });
});

describe('Jump_Scare timeline', () => {
  it('follows rise, hold and fade and ends within 2 s (6.8)', () => {
    expect(JUMP_SCARE_TOTAL_MS).toBeLessThanOrEqual(2_000);
    expect(jumpScareEnvelope(-1)).toBe(0);
    expect(jumpScareEnvelope(30)).toBeCloseTo(0.5, 5);
    expect(jumpScareEnvelope(60)).toBe(1);
    expect(jumpScareEnvelope(1_259)).toBe(1);
    expect(jumpScareEnvelope(1_410)).toBeCloseTo(0.5, 5);
    expect(jumpScareEnvelope(JUMP_SCARE_TOTAL_MS)).toBe(0);
  });

  it('runs the envelope on the frame clock and stops requesting frames after it ends', () => {
    const clock = fakeFrames([{ name: 'veil', kind: 'opacity', initial: 0 }]);
    clock.animator.playJumpScare();
    clock.advance(1_000);
    expect(clock.animator.values()['jumpScare']).toBe(1);
    clock.advance(JUMP_SCARE_TOTAL_MS);
    expect(clock.animator.values()['jumpScare']).toBe(0);
    const requestsAtEnd = clock.requests();
    clock.advance(3_000);
    expect(clock.requests()).toBe(requestsAtEnd);
  });

  it('holds the eased channels while the Jump_Scare runs', () => {
    const clock = fakeFrames(veilSpec);
    clock.animator.playJumpScare();
    clock.animator.setTargets({ veil: 0.3 }, LEVEL_TRANSITION_MS);
    clock.advance(1_000);
    expect(clock.animator.values()['veil']).toBe(0);
    clock.advance(1_000);
    expect(clock.animator.values()['veil']).toBe(0.3);
  });

  it('adds the Jump_Scare luminance with its fixed weight', () => {
    expect(compositeLuminance({ veil: 0, jumpScare: 1 })).toBeCloseTo(1 + JUMP_SCARE_LUMINANCE, 10);
  });
});
