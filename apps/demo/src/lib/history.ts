import { z } from "zod";
import * as Y from "yjs";
import { EDITOR_FIELD } from "@syncscribe/shared/sandbox-seed";
import { docIdSchema } from "@syncscribe/shared/schemas";
import { MAX_MESSAGE_BYTES } from "./messages";
import { HISTORY_DB } from "./keys";
import { openDatabase, request, transactionDone } from "./idb";

const STORE = "versions";
const BY_DOC = "docId";
export const MAX_VERSIONS_PER_DOC = 30;

const versionSchema = z.object({
  id: z.uuid(),
  docId: docIdSchema,
  createdAt: z.number().int().nonnegative().max(8.64e15),
  kind: z.enum(["auto", "manual"]),
  author: z.string().max(80),
  state: z.instanceof(Uint8Array).refine((s) => s.byteLength <= MAX_MESSAGE_BYTES, "Version is too large"),
});

export type VersionRecord = z.infer<typeof versionSchema>;
export type VersionSummary = Omit<VersionRecord, "state">;
export type SaveResult = { saved: true; version: VersionSummary } | { saved: false; reason: "unchanged" };

function summary({ state: _state, ...rest }: VersionRecord): VersionSummary {
  return rest;
}

/** The editor fragment as XML, marks included. Equal strings mean equal content. */
function contentKey(state: Uint8Array): string {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    return doc.getXmlFragment(EDITOR_FIELD).toString();
  } finally {
    doc.destroy();
  }
}

/**
 * Version snapshots for every demo document, in one IndexedDB database. Each
 * record is a full Yjs state, like the full app's document_versions rows.
 * Records are validated on the way out because the database is reachable
 * from any page on the same origin.
 */
export class HistoryStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error("IndexedDB is not available"));
    this.db ??= openDatabase(this.factory, HISTORY_DB, 1, (db) => {
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex(BY_DOC, "docId");
    }).catch((error: unknown) => {
      this.db = null;
      throw error;
    });
    return this.db;
  }

  private async readAll(docId: string): Promise<VersionRecord[]> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readonly");
    const raw = await request(tx.objectStore(STORE).index(BY_DOC).getAll(IDBKeyRange.only(docId)));
    const records: VersionRecord[] = [];
    for (const item of raw as unknown[]) {
      const parsed = versionSchema.safeParse(item);
      if (parsed.success && parsed.data.docId === docId) records.push(parsed.data);
    }
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }

  async list(docId: string): Promise<VersionSummary[]> {
    return (await this.readAll(docId)).map(summary);
  }

  async get(docId: string, id: string): Promise<VersionRecord | null> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readonly");
    const parsed = versionSchema.safeParse(await request(tx.objectStore(STORE).get(id)));
    return parsed.success && parsed.data.docId === docId ? parsed.data : null;
  }

  /**
   * Saves the document's current state unless its content matches the most
   * recent version. Content is compared rather than bytes, because two tabs
   * can encode the same text differently.
   */
  async save(
    docId: string,
    doc: Y.Doc,
    options: { kind: VersionRecord["kind"]; author: string; now?: number; id?: string },
  ): Promise<SaveResult> {
    const state = Y.encodeStateAsUpdate(doc);
    const existing = await this.readAll(docId);
    const latest = existing[0];
    if (latest && contentKey(latest.state) === doc.getXmlFragment(EDITOR_FIELD).toString()) {
      return { saved: false, reason: "unchanged" };
    }

    const record = versionSchema.parse({
      id: options.id ?? crypto.randomUUID(),
      docId,
      createdAt: options.now ?? Date.now(),
      kind: options.kind,
      author: options.author.slice(0, 80),
      state,
    });

    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(record);
    // Oldest first beyond the cap. existing is newest first and does not include the new record.
    for (const old of existing.slice(MAX_VERSIONS_PER_DOC - 1)) store.delete(old.id);
    await transactionDone(tx);
    return { saved: true, version: summary(record) };
  }

  async removeAll(docId: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const keys = await request(tx.objectStore(STORE).index(BY_DOC).getAllKeys(IDBKeyRange.only(docId)));
    for (const key of keys) tx.objectStore(STORE).delete(key);
    await transactionDone(tx);
  }

  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (db) (await db.catch(() => null))?.close();
  }
}
