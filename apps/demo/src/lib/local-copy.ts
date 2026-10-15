import { IndexeddbPersistence, clearDocument } from "y-indexeddb";
import type * as Y from "yjs";
import { docStorageName } from "./keys";

export type LoadStatus = "loaded" | "unavailable";

export interface LocalCopy {
  persistence: IndexeddbPersistence | null;
  status: LoadStatus;
}

/**
 * Binds a Y.Doc to its IndexedDB copy and waits for the stored updates to be
 * applied. y-indexeddb applies whatever bytes it finds; if they are corrupt or
 * the database cannot be opened, whenSynced never settles, so a timeout turns
 * that into a visible "unavailable" state instead of a page that never loads.
 */
export async function openLocalCopy(docId: string, doc: Y.Doc, timeoutMs = 4000): Promise<LocalCopy> {
  let persistence: IndexeddbPersistence;
  try {
    persistence = new IndexeddbPersistence(docStorageName(docId), doc);
  } catch {
    return { persistence: null, status: "unavailable" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const result = await Promise.race([persistence.whenSynced.then(() => "synced" as const), timedOut]);
    return { persistence, status: result === "synced" ? "loaded" : "unavailable" };
  } catch {
    return { persistence, status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function deleteLocalCopy(docId: string): Promise<void> {
  await clearDocument(docStorageName(docId));
}
