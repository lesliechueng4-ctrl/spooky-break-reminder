// Ghost artwork (Requirements 4.1, 4.5, 4.6, 21.8). The SVG is drawn for this project and lives
// in this file, so it needs no network request and has no external origin. The artwork is
// decorative: it carries no text, and assistive technology ignores it. The layer that shows it
// (hauntLayer.ts) sets the size, opacity and position from effectsFor().

/** Ghost artwork as SVG markup, for inline use or for a data URL. */
export const GHOST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" aria-hidden="true" focusable="false">
  <path fill="#e9eef5" d="M100 10 C40 10 20 60 20 110 L20 220 Q40 240 60 220 Q80 240 100 220 Q120 240 140 220 Q160 240 180 220 L180 110 C180 60 160 10 100 10 Z"/>
  <ellipse cx="75" cy="110" rx="14" ry="18" fill="#0b0b12"/>
  <ellipse cx="125" cy="110" rx="14" ry="18" fill="#0b0b12"/>
  <ellipse cx="100" cy="162" rx="12" ry="18" fill="#0b0b12"/>
</svg>`;

/**
 * The ghost as an SVG data URL, for an `<img>` or a CSS `url()`. The data URL is built from
 * GHOST_SVG, so it does not fetch anything from the network.
 */
export function ghostSvgDataUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(GHOST_SVG)}`;
}
