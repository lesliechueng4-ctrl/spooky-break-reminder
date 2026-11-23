// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { EffectTargets } from '../src/core/escalation';
import { LEVEL_TRANSITION_MS } from '../src/effects/animator';
import { CRACK_SLOTS, createHauntLayer, type FrameSource } from '../src/effects/hauntLayer';

/** Frame source that runs queued callbacks every 16 ms of fake time. */
function fakeFrames() {
  let now = 0;
  let visible = true;
  let nextHandle = 1;
  const queued = new Map<number, () => void>();
  const source: FrameSource = {
    now: () => now,
    isVisible: () => visible,
    requestFrame: (callback) => {
      const handle = nextHandle++;
      queued.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      queued.delete(handle);
    },
  };
  return {
    source,
    now: () => now,
    advance(ms: number) {
      const end = now + ms;
      while (now < end) {
        now += 16;
        const callbacks = [...queued.values()];
        queued.clear();
        for (const callback of callbacks) callback();
      }
    },
    setVisible: (value: boolean) => {
      visible = value;
    },
  };
}

const LEVEL_3: EffectTargets = {
  candleLit: false,
  veil: 0.5,
  fogScale: 1.2,
  fogOpacity: 1,
  ghostScale: 0.6,
  ghostOpacity: 0.75,
  cracks: 5,
  whisperGain: 0.4,
  possession: false,
  hidden: false,
};

function setup(reducedMotion = false) {
  const frames = fakeFrames();
  const doc = document.implementation.createHTMLDocument('layer');
  const layer = createHauntLayer(doc, { frames: frames.source, reducedMotion, seed: 7 });
  doc.body.append(layer.root);
  return { frames, doc, layer, root: layer.root };
}

describe('createHauntLayer', () => {
  it('stacks the layers in the design order: veil, ghost, fog, cracks, possession, jumpscare', () => {
    const { root, layer } = setup();
    const classes = [...root.children].map((el) => el.getAttribute('class') ?? el.tagName.toLowerCase());
    expect(classes[0]).toContain('sbr-layer-veil');
    expect(classes.slice(1, 3)).toEqual(['img', 'img']);
    expect(classes.slice(3, 5).every((c) => c.includes('sbr-layer-fog'))).toBe(true);
    expect(classes[5]).toBe('svg');
    expect(classes[6]).toContain('sbr-layer-possession');
    expect(classes[7]).toContain('sbr-layer-jumpscare');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    layer.dispose();
  });

  it('draws one crack path per crack slot', () => {
    const { root, layer } = setup();
    expect(root.querySelectorAll('path').length).toBe(CRACK_SLOTS);
    layer.dispose();
  });

  it('eases a level increase over LEVEL_TRANSITION_MS (5.3)', () => {
    const { frames, root, layer } = setup();
    layer.update(LEVEL_3);
    frames.advance(600);
    const midway = Number(root.style.getPropertyValue('--sbr-fx-veil'));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(0.5);
    frames.advance(LEVEL_TRANSITION_MS);
    expect(Number(root.style.getPropertyValue('--sbr-fx-veil'))).toBeCloseTo(0.5, 10);
    layer.dispose();
  });

  it('shows one crack per crack target and hides the rest', () => {
    const { frames, root, layer } = setup();
    layer.update(LEVEL_3);
    frames.advance(LEVEL_TRANSITION_MS + 100);
    expect(Number(root.style.getPropertyValue('--sbr-fx-crack-4'))).toBeCloseTo(1, 10);
    expect(Number(root.style.getPropertyValue('--sbr-fx-crack-5'))).toBeCloseTo(0, 10);
    layer.dispose();
  });

  it('places the ghost with a transform that uses the animated scale when motion is allowed', () => {
    const { frames, layer } = setup(false);
    layer.update(LEVEL_3);
    frames.advance(LEVEL_TRANSITION_MS + 100);
    const ghost = layer.root.querySelectorAll('img')[0]!;
    expect(ghost.style.transform).toContain('var(--sbr-fx-ghost-scale');
    layer.dispose();
  });

  it('uses a static ghost size under Reduced_Motion and crossfades to the new size (19.3)', () => {
    const { frames, layer } = setup(true);
    layer.update(LEVEL_3);
    frames.advance(16);
    const [first, second] = layer.root.querySelectorAll('img');
    const incoming = [first!, second!].find((el) => el.style.transform.includes('scale(0.6)'));
    expect(incoming).toBeDefined();
    expect(incoming!.style.transform).not.toContain('var(');
    layer.dispose();
  });

  it('hides every effect while a Snooze is active', () => {
    const { layer } = setup();
    layer.update({ ...LEVEL_3, hidden: true });
    expect(layer.root.style.visibility).toBe('hidden');
    layer.update({ ...LEVEL_3, hidden: false });
    expect(layer.root.style.visibility).toBe('visible');
    layer.dispose();
  });

  it('removes its root and stops frames on dispose', () => {
    const { frames, root, layer, doc } = setup();
    layer.update(LEVEL_3);
    layer.dispose();
    expect(root.isConnected).toBe(false);
    frames.advance(2_000);
    expect(doc.body.contains(root)).toBe(false);
  });
});
