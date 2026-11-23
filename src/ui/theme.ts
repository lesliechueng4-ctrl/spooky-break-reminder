// Theme tokens (Requirements 4.10, 5.3, 19.5, 19.6, 19.8).
//
// These constants are the single source for the --sbr-* CSS custom properties
// used by src/ui/styles.css. installTheme() writes them into a <style> element,
// so the App document and, later, the Ghost_Window document share one set of values.

/** Colors as hex strings. Text colors must meet the ratios in TEXT_ON_BACKGROUND. */
export const THEME_COLORS = {
  /** Night background behind every effect layer. */
  pageBg: '#0d0a12',
  /** Background of text fields. */
  inputBg: '#0d0a12',
  /** Near-black screen of the Eye_Ritual. It holds only the countdown, the instruction and Abandon (Requirement 8.3). */
  eyeScreenBg: '#05040a',
  /** Opaque "tombstone" panel that holds controls and status text over the effects. */
  panelBg: '#1f1a29',
  /** Borders of panels and controls. Non-text, so no text ratio applies. */
  panelEdge: '#5a4d6e',
  /** Primary text on every surface. */
  ink: '#f5ecd7',
  /** Secondary text. Use it inside panels only. */
  inkMuted: '#d6cdb8',
  /** Headings and the candle accent. */
  accent: '#ffb347',
  buttonBg: '#2e2540',
  buttonBgHover: '#3d3154',
  buttonInk: '#fff4df',
  /** Keyboard focus indicator. Non-text, needs 3:1 against each neighbouring surface. */
  focusRing: '#ffd166',
} as const;

/** Font stacks. Chinese text uses the system stack (design, Internationalization). */
export const THEME_FONTS = {
  ui: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif',
  // Latin headings only. The self-hosted OFL display font is not in public/fonts yet,
  // so headings use a system serif until that file is added.
  display: 'Georgia, "Times New Roman", serif',
} as const;

/** Sizes as CSS values. */
export const THEME_SIZES = {
  /** Minimum touch and pointer target (44 CSS px). */
  controlMin: '2.75rem',
  radius: '0.5rem',
  focusWidth: '3px',
  focusOffset: '3px',
  panelMaxWidth: '36rem',
} as const;

/** Stacking order of the layers. The effects sit below the opaque UI panels. */
export const THEME_LAYERS = {
  effects: '1',
  ui: '10',
} as const;

/** Transition durations for the Office_Safe look, in milliseconds. */
export const THEME_MOTION = {
  /** Level increase, at least 1 s (Requirement 5.3). */
  level: '1200ms',
  /** Dissolve after a Ritual_Exorcism (Requirement 4.12). */
  dissolve: '2500ms',
  /** Cracks draw in with stroke-dashoffset. */
  crackDraw: '1500ms',
} as const;

/** Text color on the background it is drawn over. Each pair needs at least 4.5:1 (Requirement 19.6). */
export const TEXT_ON_BACKGROUND: ReadonlyArray<readonly [keyof typeof THEME_COLORS, keyof typeof THEME_COLORS]> = [
  ['ink', 'pageBg'],
  ['inkMuted', 'pageBg'],
  ['accent', 'pageBg'],
  ['ink', 'inputBg'],
  ['ink', 'eyeScreenBg'],
  ['ink', 'panelBg'],
  ['inkMuted', 'panelBg'],
  ['accent', 'panelBg'],
  ['buttonInk', 'buttonBg'],
  ['buttonInk', 'buttonBgHover'],
];

const GROUPS = {
  color: THEME_COLORS,
  font: THEME_FONTS,
  size: THEME_SIZES,
  layer: THEME_LAYERS,
  motion: THEME_MOTION,
} as const;

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The `:root` block of --sbr-* custom properties, for example `--sbr-color-page-bg: #0d0a12;`. */
export function themeCss(): string {
  const lines: string[] = [];
  for (const [group, tokens] of Object.entries(GROUPS)) {
    for (const [key, value] of Object.entries(tokens)) {
      lines.push(`  --sbr-${group}-${kebab(key)}: ${value};`);
    }
  }
  return `:root {\n${lines.join('\n')}\n}\n`;
}

const THEME_STYLE_ID = 'sbr-theme';

/** Writes the tokens into a `<style id="sbr-theme">` element in the document head. Safe to call twice. */
export function installTheme(doc: Document): void {
  const existing = doc.getElementById(THEME_STYLE_ID);
  const style = existing ?? doc.createElement('style');
  style.id = THEME_STYLE_ID;
  style.textContent = themeCss();
  if (!existing) {
    doc.head.append(style);
  }
}
