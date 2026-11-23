// Fog texture for the HauntLayer (design: "Fog geometry" and the "Fog texture" row of the
// rendering decision table; Requirements 4.2, 4.7, 21.8).
//
// The texture covers the viewport in the normalized coordinates of fogAlpha in
// escalation.ts, so the layer's transform scale(S) reproduces what fogCoverage(S) measures.
// Its alpha channel is exactly fogAlpha(u, v). Seeded value noise only changes the tone of the
// fog colour, which keeps the coverage exact. The texture is generated once at startup. Without
// a canvas, the renderer uses a CSS radial gradient built from the same alpha function.

import { fogAlpha } from '../core/escalation';
import { createRng, type Rng } from '../core/rng';

/** Default texture width and height in pixels. */
export const FOG_TEXTURE_SIZE = 256;

/** Largest accepted texture side, to bound the work at startup. */
const MAX_TEXTURE_SIZE = 2048;

/** Fog colour before the noise tone is applied (pale blue-grey). */
const FOG_RGB: readonly [number, number, number] = [196, 206, 216];

/** Noise octaves and the cell count of the coarsest octave. */
const NOISE_OCTAVES = 3;
const BASE_NOISE_CELLS = 4;

/** Where the fog layer gets its image. */
export type FogSource =
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'gradient'; readonly css: string };

/**
 * RGBA pixels of the fog texture for a seed, row by row from the top left. Each pixel centre
 * (u, v) maps to the normalized viewport coordinates in [-1, 1], and its alpha is
 * round(255 x fogAlpha(u, v)). The colour tone comes from seeded fractal value noise.
 */
export function fogPixels(seed: number, size: number = FOG_TEXTURE_SIZE): Uint8ClampedArray<ArrayBuffer> {
  assertSize(size);
  const noise = fractalValueNoise(createRng(seed), size);
  const out = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
  for (let y = 0; y < size; y++) {
    const v = -1 + ((y + 0.5) * 2) / size;
    for (let x = 0; x < size; x++) {
      const u = -1 + ((x + 0.5) * 2) / size;
      const i = y * size + x;
      const tone = 0.8 + 0.2 * noise[i]!;
      out[i * 4] = FOG_RGB[0] * tone;
      out[i * 4 + 1] = FOG_RGB[1] * tone;
      out[i * 4 + 2] = FOG_RGB[2] * tone;
      out[i * 4 + 3] = Math.round(fogAlpha(u, v) * 255);
    }
  }
  return out;
}

/**
 * CSS fallback for the fog: a radial gradient whose stops sample fogAlpha along one axis. The
 * stops run from the centre (0%) to the corner (100%) of a square viewport. The circular
 * gradient matches the superellipse only along the axes, so the corners are an approximation.
 */
export function fogGradientCss(stops = 8): string {
  if (!Number.isSafeInteger(stops) || stops < 1) {
    throw new RangeError(`fogGradientCss: stops must be a positive integer, got ${String(stops)}`);
  }
  const parts: string[] = [];
  for (let k = 0; k <= stops; k++) {
    const fraction = k / stops;
    // The corner of a normalized square is at distance sqrt(2), so a fraction f is distance f x sqrt(2).
    const alpha = fogAlpha(fraction * Math.SQRT2, 0);
    parts.push(`rgba(${FOG_RGB.join(',')},${alpha.toFixed(3)}) ${(fraction * 100).toFixed(2)}%`);
  }
  return `radial-gradient(circle farthest-corner, ${parts.join(', ')})`;
}

/**
 * Builds the fog image for one document. The canvas is not attached to the page, so it is the
 * offscreen canvas of the design. When `doc` is null, or when the canvas, PNG encoding or object
 * URLs are missing or fail, the result is the CSS gradient fallback. Pass the document that
 * displays the fog, so that the Ghost_Window can build its own copy.
 */
export async function createFogSource(
  doc: Document | null,
  seed: number,
  size: number = FOG_TEXTURE_SIZE,
): Promise<FogSource> {
  const fallback: FogSource = { kind: 'gradient', css: fogGradientCss() };
  if (!doc || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return fallback;
  }
  try {
    const pixels = fogPixels(seed, size);
    const canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return fallback;
    context.putImageData(new ImageData(pixels, size, size), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return fallback;
    return { kind: 'image', url: URL.createObjectURL(blob) };
  } catch (error) {
    console.warn('fog texture fell back to a CSS gradient', error);
    return fallback;
  }
}

/**
 * Fractal value noise over the texture, in [0, 1]. Each octave draws its own lattice of random
 * values from the seeded generator, so a seed always gives the same texture.
 */
function fractalValueNoise(rng: Rng, size: number): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < NOISE_OCTAVES; octave++) {
    const cells = BASE_NOISE_CELLS << octave;
    const n = cells + 1;
    const lattice = new Float64Array(n * n);
    for (let k = 0; k < lattice.length; k++) lattice[k] = rng.next();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        out[y * size + x]! += amplitude * sampleLattice(lattice, n, cells, (x + 0.5) / size, (y + 0.5) / size);
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

/** Bilinear interpolation with smoothstep weights over one octave lattice. */
function sampleLattice(lattice: Float64Array, n: number, cells: number, fx: number, fy: number): number {
  const gx = fx * cells;
  const gy = fy * cells;
  const ix = Math.min(Math.floor(gx), cells - 1);
  const iy = Math.min(Math.floor(gy), cells - 1);
  const tx = smoothstep(gx - ix);
  const ty = smoothstep(gy - iy);
  const a = lattice[iy * n + ix]!;
  const b = lattice[iy * n + ix + 1]!;
  const c = lattice[(iy + 1) * n + ix]!;
  const d = lattice[(iy + 1) * n + ix + 1]!;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function assertSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_TEXTURE_SIZE) {
    throw new RangeError(`fog texture size must be an integer from 1 to ${MAX_TEXTURE_SIZE}, got ${String(size)}`);
  }
}
