// Tab title and favicon adapter (Requirements 16.1-16.6; design "Platform Adapters").
//
// The core (src/core/tabStatus.ts) decides the title and the favicon id. This adapter writes them to
// the App document. It compares each value with the live DOM and writes only when they differ, so an
// unchanged title or icon causes no DOM write. Writes are wrapped separately: a failure is logged and
// never throws into the engine (design: adapter errors do not stop the engine).
//
// Safari ignores favicon changes made by the page (requirements.md, Known Limitations). The title still
// updates there, so the write is harmless in that browser.
import type { FaviconId, TabStatus } from '../core/tabStatus';

export interface TabAdapterOptions {
  /** The App document. Its title and its icon link are written. */
  readonly doc: Document;
  /** The Vite base path, for example `/spooky-break-reminder/`. Icon URLs are built under it (Requirement 26.2). */
  readonly baseUrl: string;
  /** Receives adapter errors. Defaults to `console.warn`. */
  readonly log?: (message: string, error: unknown) => void;
}

export interface TabAdapter {
  /** Writes the title and the favicon when either differs from the document. Safe to call on every commit. */
  update(status: TabStatus): void;
}

/** The URL of the SVG favicon `id`, under the base path. */
export function faviconUrl(baseUrl: string, id: FaviconId): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}icons/${id}.svg`;
}

const defaultLog = (message: string, error: unknown): void => {
  console.warn(message, error);
};

/**
 * Returns the `<link rel="icon">` element in the head, or creates one when the head has none.
 * Returns null when the document has no head, so the favicon is skipped and the title still updates.
 */
function iconLink(doc: Document): HTMLLinkElement | null {
  const head = doc.head;
  if (!head) return null;

  const existing = head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (existing) return existing;

  const link = doc.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  head.append(link);
  return link;
}

export function createTabAdapter(options: TabAdapterOptions): TabAdapter {
  const { doc, baseUrl } = options;
  const log = options.log ?? defaultLog;

  return {
    update(status) {
      try {
        if (doc.title !== status.title) {
          doc.title = status.title;
        }
      } catch (error: unknown) {
        log('tab title write failed', error);
      }

      try {
        const href = faviconUrl(baseUrl, status.favicon);
        const link = iconLink(doc);
        if (link !== null && link.getAttribute('href') !== href) {
          link.setAttribute('href', href);
        }
      } catch (error: unknown) {
        log('tab favicon write failed', error);
      }
    },
  };
}
