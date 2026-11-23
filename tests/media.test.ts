// Reduced_Motion resolution (Requirements 19.1, 19.2). The Settings_Panel value overrides the operating system,
// and `system` follows it.
import { describe, expect, it } from 'vitest';
import { effectiveReducedMotion } from '../src/platform/media';

describe('effectiveReducedMotion', () => {
  it('follows the operating system by default (19.1)', () => {
    expect(effectiveReducedMotion('system', true)).toBe(true);
    expect(effectiveReducedMotion('system', false)).toBe(false);
  });

  it('turns Reduced_Motion on regardless of the operating system when set to on (19.2)', () => {
    expect(effectiveReducedMotion('on', false)).toBe(true);
    expect(effectiveReducedMotion('on', true)).toBe(true);
  });

  it('keeps Reduced_Motion off when set to off, even if the operating system asks for it (19.2)', () => {
    expect(effectiveReducedMotion('off', true)).toBe(false);
    expect(effectiveReducedMotion('off', false)).toBe(false);
  });
});
