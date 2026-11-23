import { describe, expect, it } from 'vitest';
import { GHOST_SVG, ghostSvgDataUrl } from '../src/effects/ghostArt';

describe('GHOST_SVG', () => {
  it('is an SVG with a viewBox that is hidden from assistive technology', () => {
    expect(GHOST_SVG.startsWith('<svg')).toBe(true);
    expect(GHOST_SVG).toContain('viewBox="0 0 200 240"');
    expect(GHOST_SVG).toContain('aria-hidden="true"');
  });

  it('references no external origin: the only URL is the SVG namespace', () => {
    const urls = GHOST_SVG.match(/https?:\/\/[^"\s]+/g) ?? [];
    expect(urls).toEqual(['http://www.w3.org/2000/svg']);
  });

  it('carries no text', () => {
    expect(GHOST_SVG).not.toMatch(/<text|<tspan/);
  });
});

describe('ghostSvgDataUrl', () => {
  it('encodes GHOST_SVG as an SVG data URL without a network request', () => {
    const prefix = 'data:image/svg+xml,';
    const url = ghostSvgDataUrl();
    expect(url.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(url.slice(prefix.length))).toBe(GHOST_SVG);
  });
});
