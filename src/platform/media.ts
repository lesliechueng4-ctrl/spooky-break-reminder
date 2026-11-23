// Reduced_Motion (Requirements 19.1, 19.2). The operating-system preference comes from `matchMedia`, and the
// Settings_Panel value overrides it. Platform adapter: it reads `matchMedia` and reports changes. The
// combination with the setting is a pure function, `effectiveReducedMotion`, so the App shell and the tests use
// the same rule.
import type { ReducedMotionSetting } from '../core/settings';

/** Reads the `prefers-reduced-motion: reduce` query of a window. */
export interface ReducedMotionWatch {
  /** True when the operating system asks for reduced motion. False when the browser has no matchMedia. */
  matches(): boolean;
  /** Calls the listener with the new value on each change. Returns the function that removes it. */
  subscribe(listener: (matches: boolean) => void): () => void;
}

/**
 * The Reduced_Motion value in effect (Requirements 19.1, 19.2). `on` and `off` override the operating system.
 * `system` follows it, so the default setting activates Reduced_Motion when the OS asks for it.
 */
export function effectiveReducedMotion(setting: ReducedMotionSetting, systemPrefersReduced: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return systemPrefersReduced;
}

export function watchReducedMotion(win: Window): ReducedMotionWatch {
  const query = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;

  return {
    matches: () => query?.matches ?? false,
    subscribe(listener) {
      if (query === null) return () => {};
      const handler = (event: MediaQueryListEvent): void => listener(event.matches);
      query.addEventListener('change', handler);
      return () => query.removeEventListener('change', handler);
    },
  };
}
