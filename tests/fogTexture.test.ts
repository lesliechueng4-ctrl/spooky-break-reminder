import { describe, expect, it } from 'vitest';
import { fogAlpha, fogCoverage } from '../src/core/escalation';
import { createFogSource, fogGradientCss, fogPixels } from '../src/effects/fogTexture';

/** Normalized coordinates of the centre of pixel (x, y) in a texture of the given size. */
function centre(index: number, size: number): number {
  return -1 + ((index + 0.5) * 2) / size;
}

describe('fogPixels', () => {
  it('gives the same pixels for the same seed', () => {
    expect(fogPixels(11, 32)).toEqual(fogPixels(11, 32));
  });

  it('gives different tones for different seeds', () => {
    expect(fogPixels(11, 32)).not.toEqual(fogPixels(12, 32));
  });

  it('sets each alpha to the rounded fogAlpha at the pixel centre', () => {
    const size = 32;
    const pixels = fogPixels(3, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const expected = Math.round(fogAlpha(centre(x, size), centre(y, size)) * 255);
        expect(pixels[(y * size + x) * 4 + 3]).toBe(expected);
      }
    }
  });

  it('is transparent at the centre and opaque at the corners', () => {
    const size = 32;
    const pixels = fogPixels(3, size);
    const alphaAt = (x: number, y: number) => pixels[(y * size + x) * 4 + 3];
    expect(alphaAt(size / 2 - 1, size / 2 - 1)).toBe(0);
    expect(alphaAt(0, 0)).toBe(255);
    expect(alphaAt(size - 1, size - 1)).toBe(255);
  });

  it('varies the fog tone across the texture instead of using one flat colour', () => {
    const pixels = fogPixels(3, 32);
    const reds = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) reds.add(pixels[i]!);
    expect(reds.size).toBeGreaterThan(1);
  });

  it('covers about the same share of the viewport as fogCoverage at scale 1', () => {
    const size = 256;
    const pixels = fogPixels(9, size);
    let covered = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! >= 128) covered++;
    expect(covered / (size * size)).toBeCloseTo(fogCoverage(1), 1);
  });

  it('rejects sizes that are not integers from 1 to 2048', () => {
    for (const size of [0, -4, 1.5, Number.NaN, 4096]) {
      expect(() => fogPixels(1, size)).toThrow(RangeError);
    }
  });
});

describe('fogGradientCss', () => {
  it('builds a radial gradient whose stops run from the centre to the corner', () => {
    const css = fogGradientCss(4);
    expect(css.startsWith('radial-gradient(')).toBe(true);
    const positions = [...css.matchAll(/(\d+\.\d+)%/g)].map((m) => Number(m[1]));
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(100);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it('is transparent at the centre and fully opaque at the corner', () => {
    const css = fogGradientCss(4);
    expect(css).toContain(',0.000) 0.00%');
    expect(css).toContain(',1.000) 100.00%');
  });

  it('rejects a stop count below 1', () => {
    expect(() => fogGradientCss(0)).toThrow(RangeError);
  });
});

describe('createFogSource', () => {
  it('falls back to the CSS gradient when no document is available', async () => {
    const source = await createFogSource(null, 3);
    expect(source).toEqual({ kind: 'gradient', css: fogGradientCss() });
  });
});
