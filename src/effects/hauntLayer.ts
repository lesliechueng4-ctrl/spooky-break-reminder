// HauntLayer: the stacked effect elements of the Main_Screen or the Ghost_Window (design: "Effects
// Renderer (src/effects)"; Requirements 4.1-4.12, 5.3, 19.3, 19.4, 19.10).
//
// The layer is a fixed, pointer-events:none container. The animator owns the channel values and
// writes them as CSS custom properties on the root. Elements reference those properties, so the
// only properties that change are opacity and transform.
//
// Under Reduced_Motion, ghost and fog changes in size do not animate. The new static size goes to
// the incoming element of a pair, and the pair crossfades by opacity (19.3).

import { CRACK_BASE_BY_LEVEL, type EffectTargets } from '../core/escalation';
import { MAX_SNOOZES_PER_HAUNTING } from '../core/scheduler';
import {
  type Animator,
  type ChannelSpec,
  type ChannelValues,
  createAnimator,
  DISSOLVE_TRANSITION_MS,
  LEVEL_TRANSITION_MS,
} from './animator';
import { crackPathD, generateCracks } from './cracks';
import { createFogSource, fogGradientCss, type FogSource } from './fogTexture';
import { ghostSvgDataUrl } from './ghostArt';

/** Crack elements: the level 5 base plus one per Snooze, the largest count the layer shows (4.3, 4.9). */
export const CRACK_SLOTS = Math.max(...CRACK_BASE_BY_LEVEL) + MAX_SNOOZES_PER_HAUNTING;

/** Fog scale at the start of level 2 (design: "fogScale falls linearly from 1.65"). */
const FOG_SCALE_START = 1.65;
/** Ghost width as a share of the smaller viewport side. Scale multiplies this width. */
const GHOST_WIDTH = '40vmin';
/** Jump_Scare lunge: the image grows by this fraction at full opacity (outside Reduced_Motion). */
const JUMP_LUNGE = 0.08;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** `standard` covers level changes and ritual progress (1.2 s). `dissolve` covers a Ritual_Exorcism (2.5 s). */
export type TransitionKind = 'standard' | 'dissolve';

/** Clock and visibility source. Tests inject one; the default reads the document's window. */
export interface FrameSource {
  now(): number;
  isVisible(): boolean;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

export interface HauntLayerOptions {
  readonly reducedMotion?: boolean;
  /** Seed of the crack layout and the fog textures. Same seed, same layout. */
  readonly seed?: number;
  readonly frames?: FrameSource;
}

export interface HauntLayer {
  /** The container. The caller mounts it in the document. */
  readonly root: HTMLElement;
  update(targets: EffectTargets, transition?: TransitionKind): void;
  setReducedMotion(on: boolean): void;
  playJumpScare(): void;
  dispose(): void;
}

type SwapChannel = 'ghostSwap' | 'fogSwap';

/** Two elements that crossfade. `inIndex` is the element that shows the current static size. */
interface Pair {
  readonly name: 'ghost' | 'fog';
  readonly swapChannel: SwapChannel;
  readonly els: [HTMLElement, HTMLElement];
  readonly scales: [number, number];
  inIndex: 0 | 1;
}

export function createHauntLayer(doc: Document, options: HauntLayerOptions = {}): HauntLayer {
  const frames = options.frames ?? windowFrames(doc);
  const seed = options.seed ?? 1;
  let reduced = options.reducedMotion ?? false;
  let lastTargets: EffectTargets | null = null;
  let disposed = false;
  const objectUrls: string[] = [];

  const root = doc.createElement('div');
  root.className = 'sbr-haunt-layer';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText =
    'position:fixed;inset:0;pointer-events:none;overflow:hidden;contain:strict;z-index:var(--sbr-layer-effects, 1);';

  // Z-order (design table): 1 veil, 2 ghost, 3 fog, 4 cracks, 5 possession, 6 jumpscare.
  const veil = doc.createElement('div');
  veil.className = 'sbr-layer-veil sbr-move';
  veil.style.cssText = absoluteStyle('background-color:#000;opacity:var(--sbr-fx-veil, 0);');
  root.append(veil);

  const ghost: Pair = {
    name: 'ghost',
    swapChannel: 'ghostSwap',
    els: [ghostImage(doc), ghostImage(doc)],
    scales: [0, 0],
    inIndex: 0,
  };
  root.append(...ghost.els);

  const fog: Pair = {
    name: 'fog',
    swapChannel: 'fogSwap',
    els: [fogElement(doc), fogElement(doc)],
    scales: [FOG_SCALE_START, FOG_SCALE_START],
    inIndex: 0,
  };
  root.append(...fog.els);
  fog.els[0].style.backgroundImage = fogGradientCss();
  fog.els[1].style.backgroundImage = fogGradientCss();
  for (let i = 0; i < 2; i++) {
    const el = fog.els[i]!;
    createFogSource(doc, seed + i)
      .then((source) => {
        if (disposed) {
          revokeIfObjectUrl(source);
          return;
        }
        applyFogSource(el, source, objectUrls);
      })
      .catch(() => {
        // Keeps the gradient fallback that is already set.
      });
  }

  const cracks = doc.createElementNS(SVG_NS, 'svg');
  cracks.setAttribute('viewBox', '0 0 1 1');
  cracks.setAttribute('preserveAspectRatio', 'none');
  cracks.setAttribute('style', absoluteStyle(''));
  generateCracks(seed, CRACK_SLOTS).forEach((crack, i) => {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', crackPathD(crack));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#e8e0d0');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.setAttribute('style', `opacity:var(--sbr-fx-crack-${i}, 0);`);
    cracks.append(path);
  });
  root.append(cracks);

  const possession = doc.createElement('div');
  possession.className = 'sbr-layer-possession sbr-move';
  possession.style.cssText = absoluteStyle(
    'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.9) 100%);opacity:var(--sbr-fx-possession, 0);',
  );
  root.append(possession);

  const jump = doc.createElement('div');
  jump.className = 'sbr-layer-jumpscare';
  jump.style.cssText = absoluteStyle(
    'display:flex;align-items:center;justify-content:center;background-color:rgb(0 0 0 / 0.85);opacity:var(--sbr-fx-jump-scare, 0);',
  );
  const jumpImage = ghostImage(doc);
  jumpImage.style.width = '60vmin';
  jump.append(jumpImage);
  root.append(jump);

  const specs: ChannelSpec[] = [
    { name: 'veil', kind: 'opacity', initial: 0 },
    { name: 'fogScale', kind: 'geometry', initial: FOG_SCALE_START },
    { name: 'fogOpacity', kind: 'opacity', initial: 0 },
    { name: 'ghostScale', kind: 'geometry', initial: 0 },
    { name: 'ghostOpacity', kind: 'opacity', initial: 0 },
    { name: 'ghostSwap', kind: 'opacity', initial: 1 },
    { name: 'fogSwap', kind: 'opacity', initial: 1 },
    { name: 'possession', kind: 'opacity', initial: 0 },
    ...Array.from({ length: CRACK_SLOTS }, (_, i): ChannelSpec => ({ name: `crack${i}`, kind: 'opacity', initial: 0 })),
  ];

  const animator: Animator = createAnimator(specs, {
    now: () => Math.round(frames.now()),
    isVisible: () => frames.isVisible(),
    requestFrame: (callback) => frames.requestFrame(callback),
    cancelFrame: (handle) => frames.cancelFrame(handle),
    onFrame: (values) => writeValues(values),
  });

  function writeValues(values: ChannelValues): void {
    const set = (property: string, value: number): void => {
      root.style.setProperty(property, String(value));
    };
    set('--sbr-fx-veil', values['veil'] ?? 0);
    set('--sbr-fx-fog-scale', values['fogScale'] ?? FOG_SCALE_START);
    set('--sbr-fx-fog-opacity', values['fogOpacity'] ?? 0);
    set('--sbr-fx-ghost-scale', values['ghostScale'] ?? 0);
    set('--sbr-fx-ghost-opacity', values['ghostOpacity'] ?? 0);
    set('--sbr-fx-ghost-in', values['ghostSwap'] ?? 1);
    set('--sbr-fx-ghost-out', 1 - (values['ghostSwap'] ?? 1));
    set('--sbr-fx-fog-in', values['fogSwap'] ?? 1);
    set('--sbr-fx-fog-out', 1 - (values['fogSwap'] ?? 1));
    set('--sbr-fx-possession', values['possession'] ?? 0);
    set('--sbr-fx-jump-scare', values['jumpScare'] ?? 0);
    for (let i = 0; i < CRACK_SLOTS; i++) set(`--sbr-fx-crack-${i}`, values[`crack${i}`] ?? 0);
  }

  function applyPair(pair: Pair): void {
    pair.els.forEach((el, i) => {
      const role = i === pair.inIndex ? 'in' : 'out';
      el.style.opacity = `calc(var(--sbr-fx-${pair.name}-opacity, 0) * var(--sbr-fx-${pair.name}-${role}, 0))`;
      el.style.transform = transformFor(pair, i);
    });
  }

  function transformFor(pair: Pair, index: number): string {
    const translate = pair.name === 'ghost' ? 'translate(-50%, -50%) ' : '';
    if (reduced) return `${translate}scale(${pair.scales[index]})`;
    return `${translate}scale(var(--sbr-fx-${pair.name}-scale, 1))`;
  }

  function applyJump(): void {
    jumpImage.style.transform = reduced
      ? 'none'
      : `scale(calc(1 + ${JUMP_LUNGE} * var(--sbr-fx-jump-scare, 0)))`;
  }

  /** Reduced_Motion crossfade: the incoming element takes the new static size, then both fade. */
  function swapPair(pair: Pair, value: number, duration: number): void {
    pair.inIndex = pair.inIndex === 0 ? 1 : 0;
    pair.scales[pair.inIndex] = value;
    applyPair(pair);
    animator.setTargets({ [pair.swapChannel]: 0 }, 0);
    animator.setTargets({ [pair.swapChannel]: 1 }, duration);
  }

  writeValues(animator.values());
  applyPair(ghost);
  applyPair(fog);
  applyJump();

  const onVisibility = (): void => animator.notifyVisibility();
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    root,

    update(targets, transition = 'standard') {
      const duration = transition === 'dissolve' ? DISSOLVE_TRANSITION_MS : LEVEL_TRANSITION_MS;
      const next: Record<string, number> = {
        veil: targets.veil,
        fogOpacity: targets.fogOpacity,
        ghostScale: targets.ghostScale,
        ghostOpacity: targets.ghostOpacity,
        possession: targets.possession ? 1 : 0,
      };
      // Calm_State and level 1 report no fog. Its scale is kept, and its opacity is 0.
      if (Number.isFinite(targets.fogScale)) next['fogScale'] = targets.fogScale;
      for (let i = 0; i < CRACK_SLOTS; i++) next[`crack${i}`] = i < targets.cracks ? 1 : 0;
      animator.setTargets(next, duration);

      if (reduced) {
        if (targets.ghostScale !== ghost.scales[ghost.inIndex]) swapPair(ghost, targets.ghostScale, duration);
        if (Number.isFinite(targets.fogScale) && targets.fogScale !== fog.scales[fog.inIndex]) {
          swapPair(fog, targets.fogScale, duration);
        }
      }

      root.style.visibility = targets.hidden ? 'hidden' : 'visible';
      lastTargets = targets;
    },

    setReducedMotion(on) {
      if (on === reduced) return;
      reduced = on;
      animator.setReducedMotion(on);
      if (on && lastTargets) {
        ghost.scales[ghost.inIndex] = lastTargets.ghostScale;
        if (Number.isFinite(lastTargets.fogScale)) fog.scales[fog.inIndex] = lastTargets.fogScale;
      }
      applyPair(ghost);
      applyPair(fog);
      applyJump();
    },

    playJumpScare() {
      animator.playJumpScare();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('visibilitychange', onVisibility);
      animator.dispose();
      for (const url of objectUrls) URL.revokeObjectURL?.(url);
      objectUrls.length = 0;
      root.remove();
    },
  };
}

function absoluteStyle(extra: string): string {
  return `position:absolute;inset:0;width:100%;height:100%;${extra}`;
}

function ghostImage(doc: Document): HTMLImageElement {
  const img = doc.createElement('img');
  img.src = ghostSvgDataUrl();
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.style.cssText = `position:absolute;left:50%;top:50%;width:${GHOST_WIDTH};height:auto;`;
  return img;
}

function fogElement(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'sbr-layer-fog sbr-move';
  el.style.cssText = absoluteStyle('background-size:100% 100%;transform-origin:50% 50%;');
  return el;
}

function applyFogSource(el: HTMLElement, source: FogSource, objectUrls: string[]): void {
  if (source.kind === 'image') {
    objectUrls.push(source.url);
    el.style.backgroundImage = `url("${source.url}")`;
  } else {
    el.style.backgroundImage = source.css;
  }
}

function revokeIfObjectUrl(source: FogSource): void {
  if (source.kind === 'image') URL.revokeObjectURL?.(source.url);
}

/** Frame source backed by the document's window. */
function windowFrames(doc: Document): FrameSource {
  const win: Window = doc.defaultView ?? window;
  return {
    now: () => win.performance.now(),
    isVisible: () => doc.visibilityState === 'visible',
    requestFrame: (callback) => win.requestAnimationFrame(() => callback()),
    cancelFrame: (handle) => win.cancelAnimationFrame(handle),
  };
}
