// Animator for the HauntLayer (design: "Effects Renderer"; Requirements 4.6, 4.10, 4.11, 4.12,
// 5.3, 19.3, 19.4, 19.10). Pure except for the injected dependencies: no DOM and no global clock.
//
// The animator owns the displayed value of each channel. A channel eases from its current value
// toward a target over a duration. A candidate frame is shown only when the Flash_Guard commits its
// composite luminance, so committed reversals are at least 500 ms apart (Requirement 19.4).
// The Jump_Scare runs on its own fixed timeline. While it runs, the eased channels hold still, and
// its luminance changes are committed without deferral so the 2-second limit (6.8) holds.
//
// Frames are requested only while a channel moves, a candidate is deferred, a Jump_Scare runs, or
// a new value must be written. Frames are never requested while the document is hidden (19.10).

import { fogCoverage } from '../core/escalation';
import {
  guardTarget,
  initialGuardState,
  JUMP_SCARE_FADE_MS,
  JUMP_SCARE_HOLD_MS,
  JUMP_SCARE_RISE_MS,
  JUMP_SCARE_TOTAL_MS,
  type GuardState,
} from '../core/flashGuard';

/** Level increase transition (Requirement 5.3 requires at least 1 s). */
export const LEVEL_TRANSITION_MS = 1_200;
/** Dissolve after a Ritual_Exorcism. The screen must relight within 3 s (Requirement 4.12). */
export const DISSOLVE_TRANSITION_MS = 2_500;
/** Luminance weight of the Jump_Scare in the composite luminance proxy (design, Flash_Guard). */
export const JUMP_SCARE_LUMINANCE = 0.5;

/** `opacity` channels ease in every mode. `geometry` channels (scale) snap under Reduced_Motion (19.3). */
export type ChannelKind = 'opacity' | 'geometry';

export interface ChannelSpec {
  readonly name: string;
  readonly kind: ChannelKind;
  readonly initial: number;
}

export type ChannelValues = Readonly<Record<string, number>>;

/** Injected dependencies. The shell supplies the window clock and the document visibility. */
export interface AnimatorDeps {
  /** Monotonic time in integer milliseconds. */
  readonly now: () => number;
  readonly isVisible: () => boolean;
  readonly requestFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
  /** Receives the displayed values after every frame that changed them. */
  readonly onFrame: (values: ChannelValues) => void;
}

export interface Animator {
  /** Starts easing each named channel toward its target over `durationMs` (0 snaps). */
  setTargets(targets: ChannelValues, durationMs: number): void;
  setReducedMotion(on: boolean): void;
  /** Starts the Jump_Scare timeline. A call while one runs is ignored. */
  playJumpScare(): void;
  /** Call on every document visibility change. */
  notifyVisibility(): void;
  /** The displayed values, as of the last committed frame. */
  values(): ChannelValues;
  dispose(): void;
}

/** Jump_Scare opacity envelope at `elapsedMs` after its start: rise, hold, fade (Requirement 6.8). */
export function jumpScareEnvelope(elapsedMs: number): number {
  if (!(elapsedMs >= 0) || elapsedMs >= JUMP_SCARE_TOTAL_MS) return 0;
  if (elapsedMs < JUMP_SCARE_RISE_MS) return elapsedMs / JUMP_SCARE_RISE_MS;
  if (elapsedMs < JUMP_SCARE_RISE_MS + JUMP_SCARE_HOLD_MS) return 1;
  return 1 - (elapsedMs - JUMP_SCARE_RISE_MS - JUMP_SCARE_HOLD_MS) / JUMP_SCARE_FADE_MS;
}

/**
 * Composite luminance proxy `L = (1 - veil) x (1 - 0.5 x fogCoverage x fogOpacity) + 0.5 x jump`
 * (design, Flash_Guard). Missing channels count as 0, and a missing fog scale counts as 1.
 */
export function compositeLuminance(values: ChannelValues): number {
  const veil = values['veil'] ?? 0;
  const fogOpacity = values['fogOpacity'] ?? 0;
  const fog = fogOpacity > 0 ? fogOpacity * coverageAt(values['fogScale'] ?? 1) : 0;
  return (1 - veil) * (1 - 0.5 * fog) + JUMP_SCARE_LUMINANCE * (values['jumpScare'] ?? 0);
}

interface Track {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly duration: number;
}

export function createAnimator(specs: readonly ChannelSpec[], deps: AnimatorDeps): Animator {
  const kinds = new Map<string, ChannelKind>();
  const initials = new Map<string, number>();
  const tracks = new Map<string, Track>();
  let displayed: Record<string, number> = { jumpScare: 0 };

  for (const spec of specs) {
    if (kinds.has(spec.name)) throw new RangeError(`animator: duplicate channel ${spec.name}`);
    if (!Number.isFinite(spec.initial)) throw new RangeError(`animator: channel ${spec.name} needs a finite initial value`);
    kinds.set(spec.name, spec.kind);
    initials.set(spec.name, spec.initial);
    displayed[spec.name] = spec.initial;
  }

  let guard: GuardState = initialGuardState(compositeLuminance(displayed));
  let reduced = false;
  let jumpStart: number | null = null;
  let deferred = false;
  let handle: number | null = null;
  let disposed = false;

  function valueOf(name: string, t: number): number {
    const track = tracks.get(name);
    if (!track) return initials.get(name) ?? 0;
    return trackValue(track, t);
  }

  function easedValues(t: number): Record<string, number> {
    const out: Record<string, number> = { jumpScare: 0 };
    for (const name of kinds.keys()) out[name] = valueOf(name, t);
    return out;
  }

  function anyMoving(t: number): boolean {
    for (const track of tracks.values()) {
      if (track.duration > 0 && t < track.start + track.duration) return true;
    }
    return false;
  }

  function ensureFrame(): void {
    if (disposed || handle !== null || !deps.isVisible()) return;
    handle = deps.requestFrame(frame);
  }

  function frame(): void {
    handle = null;
    if (disposed || !deps.isVisible()) return;
    const t = Math.round(deps.now());

    if (jumpStart !== null && t < jumpStart + JUMP_SCARE_TOTAL_MS) {
      // The Jump_Scare holds the eased channels and commits its own luminance changes.
      displayed = { ...displayed, jumpScare: jumpScareEnvelope(t - jumpStart) };
      guard = forcedCommit(guard, compositeLuminance(displayed), t);
      deferred = false;
    } else if (jumpStart !== null) {
      jumpStart = null;
      displayed = { ...easedValues(t), jumpScare: 0 };
      guard = forcedCommit(guard, compositeLuminance(displayed), t);
      deferred = false;
    } else {
      const candidate = easedValues(t);
      const lum = compositeLuminance(candidate);
      const next = guardTarget(guard, lum, t);
      if (next.lum === lum) {
        guard = next;
        displayed = candidate;
        deferred = false;
      } else {
        deferred = true;
      }
    }

    deps.onFrame(displayed);
    if (jumpStart !== null || deferred || anyMoving(t)) ensureFrame();
  }

  return {
    setTargets(targets, durationMs) {
      if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
        throw new RangeError(`animator: durationMs must be a non-negative integer, got ${String(durationMs)}`);
      }
      const t = Math.round(deps.now());
      let changed = false;
      for (const [name, to] of Object.entries(targets)) {
        const kind = kinds.get(name);
        if (kind === undefined) throw new RangeError(`animator: unknown channel ${name}`);
        if (!Number.isFinite(to)) throw new RangeError(`animator: target for ${name} must be finite, got ${String(to)}`);
        const current = tracks.get(name);
        if (current ? current.to === to : initials.get(name) === to) continue;
        const duration = kind === 'geometry' && reduced ? 0 : durationMs;
        tracks.set(name, { from: valueOf(name, t), to, start: t, duration });
        changed = true;
      }
      if (changed) ensureFrame();
    },

    setReducedMotion(on) {
      if (on === reduced) return;
      reduced = on;
      if (on) {
        // Geometry channels stop moving and land on their target (19.3). Opacity channels keep easing.
        const t = Math.round(deps.now());
        for (const [name, track] of tracks) {
          if (kinds.get(name) !== 'geometry') continue;
          tracks.set(name, { from: track.to, to: track.to, start: t, duration: 0 });
        }
      }
      ensureFrame();
    },

    playJumpScare() {
      if (jumpStart !== null) return;
      jumpStart = Math.round(deps.now());
      ensureFrame();
    },

    notifyVisibility() {
      if (!deps.isVisible()) {
        if (handle !== null) {
          deps.cancelFrame(handle);
          handle = null;
        }
        return;
      }
      // One frame brings the displayed values up to date after a hidden period.
      ensureFrame();
    },

    values() {
      return displayed;
    },

    dispose() {
      disposed = true;
      if (handle !== null) deps.cancelFrame(handle);
      handle = null;
    },
  };
}

/** Eased value of a track at time `t`, using smoothstep easing. */
function trackValue(track: Track, t: number): number {
  if (track.duration <= 0 || t >= track.start + track.duration) return track.to;
  const p = Math.max(0, (t - track.start) / track.duration);
  return track.from + (track.to - track.from) * (p * p * (3 - 2 * p));
}

/** Commits a luminance change without the 500 ms deferral. Used only for the Jump_Scare timeline. */
function forcedCommit(prev: GuardState, lum: number, atMs: number): GuardState {
  const delta = lum - prev.lum;
  if (delta === 0) return prev;
  const dir: -1 | 1 = delta > 0 ? 1 : -1;
  const reversal = prev.dir !== 0 && dir !== prev.dir;
  return { lum, dir, reversedAtMs: reversal ? atMs : prev.reversedAtMs };
}

/** Fog coverage cache keyed by the scale in hundredths. Coverage is a pure function of the scale. */
const coverageCache = new Map<number, number>();

function coverageAt(scale: number): number {
  const key = Math.round(Math.max(scale, 0.01) * 100);
  let coverage = coverageCache.get(key);
  if (coverage === undefined) {
    coverage = fogCoverage(key / 100);
    coverageCache.set(key, coverage);
  }
  return coverage;
}
