// Crack layouts for Haunting_Level 3 and above (Requirements 4.3, 4.9).
//
// Each crack is a seeded branching random walk. It starts on a screen edge and grows inward,
// and its branches split off with decreasing depth. Crack i uses its own generator, derived from
// the seed and i, so generateCracks(seed, n) is a prefix of generateCracks(seed, n + 1). A Snooze
// that adds one crack leaves the existing cracks where they were.
//
// Coordinates are in viewport units: x and y run from 0 to 1, and the origin is the top left.
// The renderer maps them to the Main_Screen or the Ghost_Window, for example with an SVG
// viewBox of "0 0 1 1" and preserveAspectRatio "none". The crack count comes from
// effectsFor(...).cracks, which is built from CRACK_BASE_BY_LEVEL plus one per Snooze.

import { createRng, type Rng } from '../core/rng';

/** One straight piece of a crack. `depth` is 0 on the trunk and grows by 1 on each branch. */
export interface CrackSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly depth: number;
}

/** One crack as its list of segments, starting on the edge of the viewport. */
export type Crack = readonly CrackSegment[];

/** Upper bound on the segments of one crack, so a layout stays small. */
const MAX_SEGMENTS_PER_CRACK = 60;
/** Branches stop at this depth. */
const MAX_BRANCH_DEPTH = 2;
/** Trunk length before the walk stops, in segments. */
const TRUNK_STEPS = 14;
/** Step length range in viewport units. */
const STEP_MIN = 0.03;
const STEP_SPAN = 0.05;
/** Maximum change of heading per step, in radians. */
const HEADING_JITTER = 0.35;
/** Starting heading offset from the direction of the centre, in radians. */
const START_SPREAD = 0.6;
/** Chance that a segment spawns a branch while the depth and step limits allow it. */
const BRANCH_CHANCE = 0.12;

interface Walker {
  x: number;
  y: number;
  heading: number;
  stepsLeft: number;
  depth: number;
}

/**
 * Returns `n` cracks for a seed. The layout is deterministic, so a stored seed reproduces the
 * same cracks after a reload. Only the seeded generator is used, never Math.random.
 *
 * The seed is folded to 32 bits, so seeds that differ only above bit 31 give the same layout.
 */
export function generateCracks(seed: number, n: number): Crack[] {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`generateCracks: seed must be a safe integer, got ${String(seed)}`);
  }
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`generateCracks: n must be a non-negative integer, got ${String(n)}`);
  }
  const cracks: Crack[] = [];
  for (let i = 0; i < n; i++) {
    cracks.push(growCrack(createRng(crackSeed(seed, i))));
  }
  return cracks;
}

/**
 * SVG path data for one crack, with one `M ... L ...` pair per segment. Coordinates are written
 * with four decimals, which is finer than a pixel on any screen the App supports.
 */
export function crackPathD(crack: Crack): string {
  return crack
    .map((s) => `M${s.x1.toFixed(4)} ${s.y1.toFixed(4)}L${s.x2.toFixed(4)} ${s.y2.toFixed(4)}`)
    .join('');
}

/** Seed of crack `index` for a layout seed, mixed so that neighbouring indices differ. */
function crackSeed(seed: number, index: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function growCrack(rng: Rng): Crack {
  const segments: CrackSegment[] = [];
  const start = edgePoint(rng);
  const towardCentre = Math.atan2(0.5 - start.y, 0.5 - start.x);
  const stack: Walker[] = [
    {
      x: start.x,
      y: start.y,
      heading: towardCentre + (rng.next() * 2 - 1) * START_SPREAD,
      stepsLeft: TRUNK_STEPS,
      depth: 0,
    },
  ];

  let walker = stack.pop();
  while (walker && segments.length < MAX_SEGMENTS_PER_CRACK) {
    let { x, y, heading, stepsLeft } = walker;
    const { depth } = walker;
    while (stepsLeft > 0 && segments.length < MAX_SEGMENTS_PER_CRACK) {
      heading += (rng.next() * 2 - 1) * HEADING_JITTER;
      const length = STEP_MIN + STEP_SPAN * rng.next();
      const nx = x + Math.cos(heading) * length;
      const ny = y + Math.sin(heading) * length;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) break;
      segments.push({ x1: x, y1: y, x2: nx, y2: ny, depth });
      x = nx;
      y = ny;
      stepsLeft--;
      if (depth < MAX_BRANCH_DEPTH && stepsLeft > 2 && rng.next() < BRANCH_CHANCE) {
        const side = rng.next() < 0.5 ? -1 : 1;
        stack.push({
          x,
          y,
          heading: heading + side * (0.5 + 0.5 * rng.next()),
          stepsLeft: Math.floor(stepsLeft / 2),
          depth: depth + 1,
        });
      }
    }
    walker = stack.pop();
  }
  return segments;
}

/** A point on one of the four edges, away from the corners. */
function edgePoint(rng: Rng): { x: number; y: number } {
  const side = rng.nextInt(0, 3);
  const t = 0.1 + 0.8 * rng.next();
  switch (side) {
    case 0:
      return { x: t, y: 0 };
    case 1:
      return { x: 1, y: t };
    case 2:
      return { x: t, y: 1 };
    default:
      return { x: 0, y: t };
  }
}
