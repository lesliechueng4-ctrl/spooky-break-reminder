import { describe, expect, it, vi } from 'vitest';
import {
  createLifecycle,
  type LifecycleClock,
  type LifecycleDocument,
  type LifecycleEvent,
} from '../src/platform/lifecycle';

interface FakeOptions {
  freezeResume?: boolean;
  wasDiscarded?: boolean;
  visibility?: DocumentVisibilityState;
}

/** A document built on the real EventTarget. Chromium-only properties exist only when requested. */
function fakeDocument(options: FakeOptions = {}): LifecycleDocument {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: options.visibility ?? 'visible',
  });
  if (options.freezeResume) {
    Object.assign(doc, { onfreeze: null, onresume: null });
  }
  if (options.wasDiscarded !== undefined) {
    Object.assign(doc, { wasDiscarded: options.wasDiscarded });
  }
  return doc as unknown as LifecycleDocument;
}

function fakeClock(wall: number, mono: number): LifecycleClock & { set(wall: number, mono: number): void } {
  let now = { wall, mono };
  return {
    wall: () => now.wall,
    mono: () => now.mono,
    set: (nextWall, nextMono) => {
      now = { wall: nextWall, mono: nextMono };
    },
  };
}

function setup(options: FakeOptions = {}, clock = fakeClock(1_000, 500)) {
  const doc = fakeDocument(options);
  const win = new EventTarget();
  const onError = vi.fn();
  const adapter = createLifecycle({ doc, win, clock, onError });
  const events: LifecycleEvent[] = [];
  adapter.subscribe((event) => events.push(event));
  return { doc, win, clock, adapter, events, onError };
}

describe('createLifecycle feature detection', () => {
  it('reports every signal and the discard when the browser provides them', () => {
    const { adapter } = setup({ freezeResume: true, wasDiscarded: true });
    expect(adapter.support).toEqual({ freezeResume: true, wasDiscarded: true });
    expect(adapter.startupIntervention).toBe('discarded');
    adapter.dispose();
  });

  it('reports none and stays silent when the browser lacks freeze, resume and wasDiscarded', () => {
    const { adapter, doc, events } = setup({});
    expect(adapter.support).toEqual({ freezeResume: false, wasDiscarded: false });
    expect(adapter.startupIntervention).toBe('none');

    doc.dispatchEvent(new Event('freeze'));
    doc.dispatchEvent(new Event('resume'));
    expect(events).toEqual([]);
    adapter.dispose();
  });

  it('reports none at startup when wasDiscarded is false', () => {
    const { adapter } = setup({ freezeResume: true, wasDiscarded: false });
    expect(adapter.support.wasDiscarded).toBe(true);
    expect(adapter.startupIntervention).toBe('none');
    adapter.dispose();
  });
});

describe('createLifecycle events', () => {
  it('reports visibility changes with whole-millisecond timestamps', () => {
    const clock = fakeClock(1_000.4, 500.6);
    const { adapter, doc, events } = setup({ visibility: 'visible' }, clock);

    Object.assign(doc, { visibilityState: 'hidden' });
    doc.dispatchEvent(new Event('visibilitychange'));

    expect(events).toEqual([{ type: 'visibility', visible: false, atWall: 1_000, atMono: 501 }]);
    adapter.dispose();
  });

  it('reports pagehide and pageshow with the persisted flag', () => {
    const { adapter, win, events } = setup();

    win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    win.dispatchEvent(new Event('pageshow'));

    expect(events.map((e) => [e.type, 'persisted' in e ? e.persisted : undefined])).toEqual([
      ['pagehide', true],
      ['pageshow', false],
      ['pageshow', false],
    ]);
    adapter.dispose();
  });

  it('delivers freeze synchronously and reports resume with the freeze time', () => {
    const clock = fakeClock(2_000, 800);
    const { adapter, doc, events } = setup({ freezeResume: true }, clock);

    doc.dispatchEvent(new Event('freeze'));
    // Listeners run inside the dispatch call, so the engine can write frozenAtWall before the page freezes.
    expect(events).toEqual([{ type: 'freeze', atWall: 2_000, atMono: 800 }]);

    clock.set(9_000, 1_000);
    doc.dispatchEvent(new Event('resume'));
    expect(events[1]).toEqual({ type: 'resume', frozenAtWall: 2_000, atWall: 9_000, atMono: 1_000 });

    doc.dispatchEvent(new Event('resume'));
    expect(events[2]).toMatchObject({ type: 'resume', frozenAtWall: null });
    adapter.dispose();
  });
});

describe('createLifecycle subscriptions and errors', () => {
  it('stops delivering to a listener after unsubscribe', () => {
    const { adapter, doc } = setup();
    const received: LifecycleEvent[] = [];
    const unsubscribe = adapter.subscribe((event) => received.push(event));

    unsubscribe();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(received).toEqual([]);
    adapter.dispose();
  });

  it('logs a throwing listener and still delivers to the others', () => {
    const { adapter, doc, events, onError } = setup();
    const boom = new Error('listener failed');
    adapter.subscribe(() => {
      throw boom;
    });

    doc.dispatchEvent(new Event('visibilitychange'));

    expect(onError).toHaveBeenCalledWith(boom);
    expect(events).toHaveLength(1);
    adapter.dispose();
  });

  it('removes every browser listener on dispose', () => {
    const { adapter, doc, win, events } = setup({ freezeResume: true });
    adapter.dispose();

    doc.dispatchEvent(new Event('visibilitychange'));
    doc.dispatchEvent(new Event('freeze'));
    win.dispatchEvent(new Event('pagehide'));
    expect(events).toEqual([]);
  });
});
