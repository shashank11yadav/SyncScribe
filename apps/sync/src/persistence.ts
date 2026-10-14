import { desc, eq } from "drizzle-orm";
import * as Y from "yjs";
import { documentVersions, documents, type Database } from "@syncscribe/db";

export class DocumentGone extends Error {
  readonly reason = "document-deleted";
}

export async function loadDocumentState(db: Database, docId: string, target: Y.Doc): Promise<void> {
  const [row] = await db
    .select({ state: documents.state })
    .from(documents)
    .where(eq(documents.id, docId))
    .limit(1);
  if (!row) throw new DocumentGone("Document no longer exists");
  if (row.state && row.state.byteLength > 0) Y.applyUpdate(target, row.state);
}

/**
 * Persists the merged Yjs state and, if enough time has passed since the last
 * version, records a snapshot for the history panel. Uses UPDATE only: if the
 * owner deleted the document while it was still open, nothing is resurrected.
 */
export async function storeDocumentState(
  db: Database,
  docId: string,
  source: Y.Doc,
  options: { snapshotIntervalMs: number; actorId: string | null; now?: Date },
): Promise<{ stored: boolean; snapshotted: boolean }> {
  const state = Y.encodeStateAsUpdate(source);
  const now = options.now ?? new Date();

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(documents)
      .set({ state, updatedAt: now })
      .where(eq(documents.id, docId))
      .returning({ id: documents.id });
    if (updated.length === 0) return { stored: false, snapshotted: false };

    const [latest] = await tx
      .select({ createdAt: documentVersions.createdAt })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, docId))
      .orderBy(desc(documentVersions.createdAt))
      .limit(1);

    const due = !latest || now.getTime() - latest.createdAt.getTime() >= options.snapshotIntervalMs;
    if (due) {
      await tx.insert(documentVersions).values({
        documentId: docId,
        state,
        kind: "auto",
        createdBy: options.actorId,
        createdAt: now,
      });
    }
    return { stored: true, snapshotted: due };
  });
}
