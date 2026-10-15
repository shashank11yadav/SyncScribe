import * as Y from "yjs";
import { writeSeed, type SeedBlock } from "@syncscribe/shared/sandbox-seed";
import { createDocument, loadDocuments, removeDocument, type DocumentEntry, type ListResult } from "./documents";
import type { HistoryStore } from "./history";
import { SEEDED_KEY } from "./keys";
import { deleteLocalCopy, openLocalCopy } from "./local-copy";
import type { KeyValueStore } from "./storage";
import { WELCOME_SEED, WELCOME_TITLE } from "./welcome";

/** Creates a list entry and, if given, writes starting content into its local copy. */
export async function createSeededDocument(
  store: KeyValueStore,
  input: { title?: string; seed?: SeedBlock[] } = {},
): Promise<ListResult<DocumentEntry>> {
  const created = createDocument(store, { title: input.title });
  if (!created.ok || !input.seed) return created;
  const doc = new Y.Doc();
  const copy = await openLocalCopy(created.value.id, doc);
  writeSeed(doc, input.seed, "seed");
  // destroy() closes the database only after the pending write transaction commits.
  await copy.persistence?.destroy();
  doc.destroy();
  return created;
}

/**
 * Adds the welcome document the first time someone opens the demo. A Web Lock
 * keeps two tabs opened at the same moment from both adding one.
 */
export async function ensureWelcomeDocument(store: KeyValueStore): Promise<void> {
  const run = async () => {
    if (store.getItem(SEEDED_KEY) !== null || loadDocuments(store).length > 0) return;
    store.setItem(SEEDED_KEY, "1");
    await createSeededDocument(store, { title: WELCOME_TITLE, seed: WELCOME_SEED });
  };
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(SEEDED_KEY, run);
    } else {
      await run();
    }
  } catch {
    // Storage blocked: the list simply starts empty.
  }
}

/** Removes the list entry, the document's IndexedDB copy and its history. */
export async function deleteEverywhere(store: KeyValueStore, history: HistoryStore, docId: string): Promise<void> {
  removeDocument(store, docId);
  // Another tab with the document open closes its connection when it hears about the
  // delete (and on versionchange), so these may wait briefly rather than fail.
  await Promise.allSettled([deleteLocalCopy(docId), history.removeAll(docId)]);
}
