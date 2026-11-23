// Local_Storage adapter (Requirements 21.3, 21.5, 21.6, 21.7, 25.7). This is platform code: it reads
// and writes the browser storage and reports failures through an injected callback. The key layout
// and the record envelope come from src/core/persistence.ts.
import {
  APP_KEY_PREFIX,
  STORAGE_VERSION,
  parseStored,
  serialize,
  storageKey,
  type StorageMode,
  type StoreKind,
  type StoredRecords,
} from '../core/persistence';

/** Why records are kept in memory only. Both reasons lead to the "changes will not be saved" notice (21.5). */
export type StorageNotice = 'unavailable' | 'quota';

/** Result of reading one record. `invalid` means text exists but fails parseStored. */
export type RecordRead<K extends StoreKind> =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'ok'; value: StoredRecords[K] };

export interface StorageOptions {
  /** Normal use or Demo_Mode. It selects the schedule and log keys (25.7). */
  mode: StorageMode;
  /** Returns the browser storage. A throw, such as the SecurityError of blocked storage, means unavailable. */
  source?: () => Storage;
  /** Receives each switch to memory-only storage. The engine turns it into the notice. */
  report?: (notice: StorageNotice) => void;
}

export interface AppStorage {
  /** True while records go to the browser storage; false once they are kept in memory. */
  readonly persistent: boolean;
  readRecord<K extends StoreKind>(kind: K): RecordRead<K>;
  writeRecord<K extends StoreKind>(kind: K, value: StoredRecords[K]): void;
  /** Removes every key that starts with `sbr:` from the browser storage and from memory (21.6). */
  eraseAll(): void;
}

const PROBE_KEY = `${APP_KEY_PREFIX}v${STORAGE_VERSION}:probe`;
const QUOTA_ERROR_NAMES: ReadonlySet<string> = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
/** Legacy DOMException code 22 and the Firefox code 1014. */
const QUOTA_ERROR_CODES: ReadonlySet<number> = new Set([22, 1014]);

function browserLocalStorage(): Storage {
  const storage: Storage | undefined = globalThis.localStorage;
  if (!storage) throw new Error('localStorage is not available');
  return storage;
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (typeof name === 'string' && QUOTA_ERROR_NAMES.has(name))
    || (typeof code === 'number' && QUOTA_ERROR_CODES.has(code));
}

function warn(message: string, error: unknown): void {
  console.warn(`[storage] ${message}`, error);
}

/** Writes and removes a probe key. Throws when the browser storage cannot take a write. */
function probe(storage: Storage): void {
  storage.setItem(PROBE_KEY, '1');
  storage.removeItem(PROBE_KEY);
}

/** Lists the `sbr:` keys first, so that removing them does not shift the indexes being read. */
function appKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && key.startsWith(APP_KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * Opens the App's storage. A probe write decides at startup whether the browser storage can be
 * used. If it cannot, or a later write fails, records move to an in-memory map for the rest of the
 * page session, and `report` is called once for that switch. Reads check the in-memory map first,
 * so a record written after the switch is read back even when the browser storage is full.
 */
export function openStorage(options: StorageOptions): AppStorage {
  const { mode } = options;
  const source = options.source ?? browserLocalStorage;
  const memory = new Map<string, string>();
  let host: Storage | null = null;
  let persistent = false;

  const notify = (notice: StorageNotice): void => {
    try {
      options.report?.(notice);
    } catch (error) {
      warn('storage notice handler failed', error);
    }
  };

  try {
    host = source();
    probe(host);
    persistent = true;
  } catch (error) {
    warn('browser storage is not usable at startup; records stay in memory', error);
    notify(isQuotaError(error) ? 'quota' : 'unavailable');
  }

  function stopPersisting(error: unknown): void {
    warn('write to browser storage failed; records stay in memory', error);
    persistent = false;
    notify(isQuotaError(error) ? 'quota' : 'unavailable');
  }

  function readText(key: string): string | null {
    const kept = memory.get(key);
    if (kept !== undefined) return kept;
    if (host === null) return null;
    try {
      return host.getItem(key);
    } catch (error) {
      warn(`could not read ${key}; treating it as missing`, error);
      return null;
    }
  }

  function writeText(key: string, text: string): void {
    if (persistent && host !== null) {
      try {
        host.setItem(key, text);
        return;
      } catch (error) {
        stopPersisting(error);
      }
    }
    memory.set(key, text);
  }

  return {
    get persistent(): boolean {
      return persistent;
    },

    readRecord<K extends StoreKind>(kind: K): RecordRead<K> {
      const text = readText(storageKey(kind, mode));
      if (text === null) return { status: 'missing' };
      const value = parseStored(kind, text);
      return value === null ? { status: 'invalid' } : { status: 'ok', value };
    },

    writeRecord<K extends StoreKind>(kind: K, value: StoredRecords[K]): void {
      writeText(storageKey(kind, mode), serialize(kind, value));
    },

    eraseAll(): void {
      if (host !== null) {
        try {
          for (const key of appKeys(host)) {
            try {
              host.removeItem(key);
            } catch (error) {
              warn(`could not erase ${key}`, error);
            }
          }
        } catch (error) {
          warn('could not list browser storage keys for erase-all', error);
        }
      }
      // Every key in memory was written by this adapter, so all of them start with the prefix.
      memory.clear();
    },
  };
}
