// Ghost_Window adapter: Document Picture-in-Picture (design: "Platform Adapters"; Requirements 17.1, 17.2,
// 17.6, 21.8).
//
// This is the only module that calls `documentPictureInPicture`. The API is feature-detected: without it,
// `support()` reports 'none' and `open()` resolves to null, so the control stays hidden (Requirement 17.1).
// The browser opens the window only inside a user gesture, so the caller must call `open()` from a click
// handler. `requestWindow` starts inside that call, before any await, so the gesture is kept.
//
// The window document gets copies of the App's stylesheets. Only stylesheets served from the App's own
// origin under its base path are copied, so the window loads nothing from another origin (Requirement 21.8).
//
// Every browser call is caught here and logged. A failure resolves to null or closes the window, and it never
// throws into the engine (design: adapter errors do not stop the engine). This module imports nothing from
// src/core, src/ui or src/i18n. The caller supplies the language.

/** Whether the browser offers Document Picture-in-Picture. */
export type PipSupport = 'available' | 'none';

/** The initial size of the Ghost_Window, in CSS pixels (Requirement 17.2). */
export const GHOST_WINDOW_SIZE = { width: 320, height: 320 } as const;

/** A window opened through the adapter. The caller renders into `root`. */
export interface GhostWindowHandle {
  /** The document of the Ghost_Window. */
  readonly doc: Document;
  /** The window that holds the document. Its timers drive a Ritual that runs there. */
  readonly win: Window;
  /** The element the caller renders into. It sits in the body of `doc`. */
  readonly root: HTMLElement;
  /**
   * Closes the window. The `onClosed` callback runs once, however the window closed: by this call, by the
   * user, or by the browser.
   */
  close(): void;
}

export interface GhostWindowAdapter {
  support(): PipSupport;
  /**
   * Opens the window. Call it from a click handler. Resolves to null when the API is absent, the browser
   * refuses the request, or the window cannot be set up. `onClosed` runs when the window closes.
   */
  open(onClosed: () => void): Promise<GhostWindowHandle | null>;
}

export interface GhostWindowAdapterOptions {
  /** The App document. Its stylesheets are copied to the window document. */
  readonly doc: Document;
  /** The window that owns `documentPictureInPicture`. */
  readonly win: Window;
  /** The Vite base path, for example `/spooky-break-reminder/`. Only stylesheets under it are copied. */
  readonly baseUrl: string;
  /** The active language tag, for the `lang` attribute of the window document (Requirement 20.4). */
  readonly lang: () => string;
  /** Receives adapter errors. Defaults to `console.warn`. */
  readonly log?: (message: string, error: unknown) => void;
}

/** The part of the Document Picture-in-Picture API that this adapter uses. */
interface DocumentPictureInPictureApi {
  requestWindow(options?: { readonly width?: number; readonly height?: number }): Promise<Window>;
}

const defaultLog = (message: string, error: unknown): void => {
  console.warn(`[ghost] ${message}`, error);
};

/** Returns the API when the browser has it, or null. */
function pipApi(win: Window): DocumentPictureInPictureApi | null {
  const api = (win as unknown as { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture;
  return api !== undefined && api !== null && typeof api.requestWindow === 'function' ? api : null;
}

/**
 * Copies the App's stylesheets into the window document. A `<style>` element is copied with its text. A
 * `<link>` is copied only when its URL is on the App's origin under the base path (Requirement 21.8).
 */
function copyStylesheets(from: Document, to: Document, baseUrl: string): void {
  const origin = new URL(from.baseURI).origin;
  const nodes = Array.from(from.head.querySelectorAll<HTMLElement>('style, link[rel~="stylesheet"]'));
  for (const node of nodes) {
    if (node.tagName === 'LINK') {
      const url = new URL(node.getAttribute('href') ?? '', from.baseURI);
      if (url.origin !== origin || !url.pathname.startsWith(baseUrl)) continue;
      const link = to.createElement('link');
      link.rel = 'stylesheet';
      link.href = url.href;
      to.head.append(link);
    } else {
      const style = to.createElement('style');
      style.textContent = node.textContent;
      to.head.append(style);
    }
  }
}

export function createGhostWindowAdapter(options: GhostWindowAdapterOptions): GhostWindowAdapter {
  const { doc, win, baseUrl } = options;
  const log = options.log ?? defaultLog;

  /** Sets up a window that the browser has just opened. Returns null, and closes the window, on failure. */
  function setUp(pipWin: Window, onClosed: () => void): GhostWindowHandle | null {
    let closed = false;

    const finish = (): void => {
      if (closed) return;
      closed = true;
      pipWin.removeEventListener('pagehide', finish);
      try {
        onClosed();
      } catch (error) {
        log('the Ghost_Window close handler failed', error);
      }
    };

    try {
      const pipDoc = pipWin.document;
      copyStylesheets(doc, pipDoc, baseUrl);
      pipDoc.documentElement.lang = options.lang();

      const root = pipDoc.createElement('div');
      root.id = 'sbr-ghost-root';
      pipDoc.body.append(root);

      // A user who closes the window fires `pagehide`. The handle's close() also ends here, through `finish`.
      pipWin.addEventListener('pagehide', finish);

      return {
        doc: pipDoc,
        win: pipWin,
        root,
        close() {
          if (!closed) {
            try {
              pipWin.close();
            } catch (error) {
              log('could not close the Ghost_Window', error);
            }
          }
          finish();
        },
      };
    } catch (error) {
      log('could not set up the Ghost_Window', error);
      try {
        pipWin.close();
      } catch (closeError) {
        log('could not close a Ghost_Window that failed to set up', closeError);
      }
      return null;
    }
  }

  return {
    support() {
      return pipApi(win) === null ? 'none' : 'available';
    },

    open(onClosed) {
      const api = pipApi(win);
      if (api === null) return Promise.resolve(null);

      // The request starts inside this call, so it keeps the user gesture of the click (Requirement 17.2).
      let request: Promise<Window>;
      try {
        request = api.requestWindow({ ...GHOST_WINDOW_SIZE });
      } catch (error) {
        log('the browser refused to open the Ghost_Window', error);
        return Promise.resolve(null);
      }

      return request.then(
        (pipWin) => setUp(pipWin, onClosed),
        (error: unknown) => {
          log('the browser refused to open the Ghost_Window', error);
          return null;
        },
      );
    },
  };
}
