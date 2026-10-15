/** The subset of the Web Storage API the demo needs, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * localStorage when the browser allows it. Private windows and strict privacy
 * settings can throw on access or on the first write, so both are probed.
 */
export function openBrowserStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const storage = window.localStorage;
    const probe = "syncscribe-demo:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return { store: storage, persistent: true };
  } catch {
    return { store: memoryStore(), persistent: false };
  }
}

export function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage revoked mid-session. The caller keeps its in-memory copy.
    return false;
  }
}
