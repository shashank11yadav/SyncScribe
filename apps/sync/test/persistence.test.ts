import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, documentVersions } from "@syncscribe/db";
import { testDatabaseUrl } from "../../../test/env";
import { createDocument, createUser } from "../../../test/factories";
import { DocumentGone, loadDocumentState, storeDocumentState } from "../src/persistence";
import { textOf, writeParagraph } from "./helpers";

const { db, sql } = createDb(testDatabaseUrl(), { max: 2 });
afterAll(() => sql.end());

describe("persistence", () => {
  it("round-trips Yjs state through Postgres", async () => {
    const user = await createUser(db);
    const doc = await createDocument(db, [{ userId: user.id, role: "owner" }]);
    const source = new Y.Doc();
    writeParagraph(source, "persist me");
    await storeDocumentState(db, doc.id, source, { snapshotIntervalMs: 60_000, actorId: user.id });
    const target = new Y.Doc();
    await loadDocumentState(db, doc.id, target);
    expect(textOf(target)).toContain("persist me");
  });

  it("records a snapshot only once per interval", async () => {
    const user = await createUser(db);
    const doc = await createDocument(db, [{ userId: user.id, role: "owner" }]);
    const source = new Y.Doc();
    const t0 = new Date("2026-01-01T10:00:00Z");
    writeParagraph(source, "one");
    expect((await storeDocumentState(db, doc.id, source, { snapshotIntervalMs: 600_000, actorId: user.id, now: t0 })).snapshotted).toBe(true);
    writeParagraph(source, "two");
    expect((await storeDocumentState(db, doc.id, source, { snapshotIntervalMs: 600_000, actorId: user.id, now: new Date(t0.getTime() + 60_000) })).snapshotted).toBe(false);
    writeParagraph(source, "three");
    expect((await storeDocumentState(db, doc.id, source, { snapshotIntervalMs: 600_000, actorId: user.id, now: new Date(t0.getTime() + 601_000) })).snapshotted).toBe(true);
    const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id));
    expect(versions).toHaveLength(2);
  });

  it("does not recreate a deleted document", async () => {
    const missing = "0b7d7d0e-55a4-4c1a-9a4b-6b0e3b0c9d11";
    const result = await storeDocumentState(db, missing, new Y.Doc(), { snapshotIntervalMs: 1, actorId: null });
    expect(result.stored).toBe(false);
    await expect(loadDocumentState(db, missing, new Y.Doc())).rejects.toBeInstanceOf(DocumentGone);
  });
});
