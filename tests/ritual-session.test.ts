// Ritual session (Requirements 2.5, 2.6, 4.11, 7.5-7.8, 8.2, 8.5, 9.3, 9.5, 10.4, 13.5). The session runs
// the real Ritual state machines with a fake monotonic and wall clock. Timers are fake, so the countdowns
// advance only when a test moves time forward.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRitualSession, type RitualFinish } from '../src/app/ritualSession';
import type { RitualKind, RitualOrigin } from '../src/core/scheduler';
import type { RitualIntent } from '../src/ui/rituals/types';

interface World {
  wall: number;
  mono: number;
  hidden: boolean;
  listeners: Set<() => void>;
}

interface Harness {
  readonly world: World;
  readonly session: ReturnType<typeof createRitualSession>;
  readonly unlock: ReturnType<typeof vi.fn>;
  readonly playChime: ReturnType<typeof vi.fn>;
  readonly playCue: ReturnType<typeof vi.fn>;
  readonly started: Array<{ kind: RitualKind; origin: RitualOrigin }>;
  readonly finished: RitualFinish[];
}

const WALL_START = 1_000_000;
const MONO_START = 5_000;

function setup(): Harness {
  const world: World = { wall: WALL_START, mono: MONO_START, hidden: false, listeners: new Set() };
  const unlock = vi.fn(() => Promise.resolve());
  const playChime = vi.fn(() => true);
  const playCue = vi.fn(() => true);
  const started: Array<{ kind: RitualKind; origin: RitualOrigin }> = [];
  const finished: RitualFinish[] = [];

  const session = createRitualSession({
    clock: { wall: () => world.wall, mono: () => world.mono },
    visibility: {
      isHidden: () => world.hidden,
      subscribe: (listener) => {
        world.listeners.add(listener);
        return () => world.listeners.delete(listener);
      },
    },
    audio: { unlock, playChime, playCue },
    onStarted: (kind, origin) => started.push({ kind, origin }),
    onFinished: (finish) => finished.push(finish),
  });

  return { world, session, unlock, playChime, playCue, started, finished };
}

/** Moves the wall and monotonic clocks together and runs the countdown ticks on the way. */
function elapse(world: World, ms: number): void {
  for (let left = ms; left > 0; left -= 100) {
    const step = Math.min(100, left);
    world.wall += step;
    world.mono += step;
    vi.advanceTimersByTime(step);
  }
}

/** Sends a visibility change to the listeners, as the browser does after the document state changed. */
function setHidden(world: World, hidden: boolean): void {
  world.hidden = hidden;
  for (const listener of world.listeners) listener();
}

function send(harness: Harness, intent: RitualIntent): void {
  harness.session.input(intent);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting a Ritual', () => {
  it('reports the start to the engine, unlocks audio inside the call and publishes the Eye_Ritual', () => {
    const h = setup();

    expect(h.session.start('eye', 'early')).toBe(true);

    expect(h.started).toEqual([{ kind: 'eye', origin: 'early' }]);
    expect(h.unlock).toHaveBeenCalledTimes(1);
    expect(h.session.snapshot.value?.kind).toBe('eye');
    expect(h.session.snapshot.value?.origin).toBe('early');
    expect(h.session.progress.value).toBe(0);
  });

  it('refuses a second start while a Ritual runs', () => {
    const h = setup();
    h.session.start('eye', 'haunting');

    expect(h.session.start('stretch', 'haunting')).toBe(false);
    expect(h.started).toHaveLength(1);
  });

  it('ignores intents when no Ritual runs', () => {
    const h = setup();

    send(h, { type: 'abandon' });
    send(h, { type: 'press' });

    expect(h.finished).toEqual([]);
    expect(h.session.snapshot.value).toBeNull();
  });
});

describe('Eye_Ritual (Requirements 8.2, 8.4, 8.5, 8.6, 7.5)', () => {
  it('completes after 20 visible seconds, plays the chime and reports the completion time', () => {
    const h = setup();
    h.session.start('eye', 'haunting');

    elapse(h.world, 19_900);
    expect(h.finished).toEqual([]);
    elapse(h.world, 100);

    expect(h.finished).toEqual([{ kind: 'eye', status: 'completed', atWall: WALL_START + 20_000 }]);
    expect(h.playChime).toHaveBeenCalledTimes(1);
    expect(h.session.snapshot.value).toBeNull();
  });

  it('restarts the countdown on a pointer press outside Abandon', () => {
    const h = setup();
    h.session.start('eye', 'haunting');

    elapse(h.world, 15_000);
    send(h, { type: 'press' });
    elapse(h.world, 19_900);
    expect(h.finished).toEqual([]);
    elapse(h.world, 100);

    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]?.atWall).toBe(WALL_START + 35_000);
  });

  it('ends on Abandon without the chime and without completion', () => {
    const h = setup();
    h.session.start('eye', 'haunting');

    elapse(h.world, 5_000);
    send(h, { type: 'abandon' });
    elapse(h.world, 30_000);

    expect(h.finished).toEqual([{ kind: 'eye', status: 'ended', atWall: WALL_START + 5_000 }]);
    expect(h.playChime).not.toHaveBeenCalled();
  });

  it('ends on Escape from anywhere on the surface', () => {
    const h = setup();
    h.session.start('eye', 'haunting');

    elapse(h.world, 3_000);
    send(h, { type: 'key', key: 'Escape' });

    expect(h.finished).toEqual([{ kind: 'eye', status: 'ended', atWall: WALL_START + 3_000 }]);
  });

  it('publishes the countdown progress that scales the effects (Requirement 4.11)', () => {
    const h = setup();
    h.session.start('eye', 'haunting');

    elapse(h.world, 10_000);

    expect(h.session.progress.value).toBeCloseTo(0.5, 6);
  });
});

describe('hidden document (Requirements 7.7, 7.8)', () => {
  it('ends the Ritual 60 s after hiding, stamped at hiddenAt + 60 s even when the user returns later', () => {
    const h = setup();
    h.session.start('eye', 'haunting');
    elapse(h.world, 5_000);

    setHidden(h.world, true);
    h.world.wall += 90_000;
    h.world.mono += 90_000;
    setHidden(h.world, false);

    expect(h.finished).toEqual([{ kind: 'eye', status: 'ended', atWall: WALL_START + 65_000 }]);
    expect(h.playChime).not.toHaveBeenCalled();
  });

  it('keeps the Ritual running when the document is hidden for less than 60 s', () => {
    const h = setup();
    h.session.start('eye', 'haunting');
    elapse(h.world, 5_000);

    setHidden(h.world, true);
    elapse(h.world, 59_000);
    setHidden(h.world, false);
    elapse(h.world, 15_000);

    expect(h.finished).toEqual([{ kind: 'eye', status: 'completed', atWall: h.world.wall }]);
  });
});

describe('Breathing_Ritual (Requirements 9.3, 9.5, 9.8)', () => {
  it('completes at the sixth counted hold and cues each phase change', () => {
    const h = setup();
    h.session.start('breathing', 'haunting');

    for (let hold = 0; hold < 6; hold += 1) {
      send(h, { type: 'press' });
      elapse(h.world, 4_000);
      send(h, { type: 'release' });
      elapse(h.world, 4_000);
    }

    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]?.status).toBe('completed');
    expect(h.playChime).toHaveBeenCalledTimes(1);
    expect(h.playCue).toHaveBeenCalledWith('exhale');
  });

  it('does not count a hold shorter than 3 s and publishes no progress for it', () => {
    const h = setup();
    h.session.start('breathing', 'haunting');

    send(h, { type: 'press' });
    elapse(h.world, 2_000);
    send(h, { type: 'release' });

    expect(h.session.progress.value).toBe(0);
    expect(h.finished).toEqual([]);
  });

  it('ignores repeated key events while Space is held', () => {
    const h = setup();
    h.session.start('breathing', 'haunting');

    send(h, { type: 'press' });
    elapse(h.world, 1_000);
    send(h, { type: 'press', repeat: true });
    elapse(h.world, 2_000);
    send(h, { type: 'release' });

    // The hold is 3 s long from its first press, so it counts once.
    expect(h.session.progress.value).toBeCloseTo(1 / 6, 6);
  });
});

describe('Stretch_Ritual (Requirements 10.1, 10.4, 10.5)', () => {
  it('ignores the completion control during the step countdown and completes after the fourth step', () => {
    const h = setup();
    h.session.start('stretch', 'haunting');

    send(h, { type: 'done' });
    const early = h.session.snapshot.value;
    if (early?.kind !== 'stretch') throw new Error('expected a stretch snapshot');
    expect(early.state.stepIndex).toBe(0);

    for (let step = 0; step < 4; step += 1) {
      elapse(h.world, 20_000);
      send(h, { type: 'done' });
    }

    expect(h.finished).toEqual([{ kind: 'stretch', status: 'completed', atWall: h.world.wall }]);
    expect(h.playChime).toHaveBeenCalledTimes(1);
  });

  it('moves to the next step when the enabled control is activated', () => {
    const h = setup();
    h.session.start('stretch', 'early');

    elapse(h.world, 20_000);
    send(h, { type: 'done' });

    const snapshot = h.session.snapshot.value;
    if (snapshot?.kind !== 'stretch') throw new Error('expected a stretch snapshot');
    expect(snapshot.state.stepIndex).toBe(1);
    expect(snapshot.origin).toBe('early');
  });
});

describe('cancel and dispose', () => {
  it('drops the Ritual without reporting it, so the engine is not told twice', () => {
    const h = setup();
    h.session.start('eye', 'haunting');
    elapse(h.world, 5_000);

    h.session.cancel();
    elapse(h.world, 30_000);

    expect(h.finished).toEqual([]);
    expect(h.session.snapshot.value).toBeNull();
    expect(h.session.start('eye', 'haunting')).toBe(true);
  });

  it('removes the visibility listener on dispose', () => {
    const h = setup();
    h.session.dispose();

    expect(h.world.listeners.size).toBe(0);
  });
});
