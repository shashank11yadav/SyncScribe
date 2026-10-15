import "fake-indexeddb/auto";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { docStorageName } from "../src/lib/keys";
import { deleteLocalCopy, openLocalCopy } from "../src/lib/local-copy";
import { createSeededDocument } from "../src/lib/workspace";
import { memoryStore } from "../src/lib/storage";
import { textOf, writeParagraph } from "./helpers";

describe("local copy in IndexedDB", () => {
  it("persists edits and loads them in a fresh document", async () => {
    const docId = crypto.randomUUID();
    const first = new Y.Doc();
    const copy = await openLocalCopy(docId, first);
    expect(copy.status).toBe("loaded");
    writeParagraph(first, "survives a reload");
    await copy.persistence?.destroy();

    const second = new Y.Doc();
    const reopened = await openLocalCopy(docId, second);
    expect(reopened.status).toBe("loaded");
    expect(textOf(second)).toContain("survives a reload");
    await reopened.persistence?.destroy();
  });

  it("reports corrupt stored updates as unavailable instead of hanging", async () => {
    const docId = crypto.randomUUID();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(docStorageName(docId));
      req.onupgradeneeded = () => {
        req.result.createObjectStore("updates", { autoIncrement: true });
        req.result.createObjectStore("custom");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("updates", "readwrite");
    tx.objectStore("updates").add(new Uint8Array([255, 255, 255, 255, 9]));
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();

    // y-indexeddb rethrows the decode error from inside its own promise chain.
    const swallow = (reason: unknown) => void reason;
    process.on("unhandledRejection", swallow);
    try {
      const copy = await openLocalCopy(docId, new Y.Doc(), 200);
      expect(copy.status).toBe("unavailable");
      await copy.persistence?.destroy();
    } finally {
      process.off("unhandledRejection", swallow);
    }
  });

  it("creates a seeded document whose content is there on first open", async () => {
    const store = memoryStore();
    const created = await createSeededDocument(store, {
      title: "Seeded",
      seed: [{ type: "paragraph", inline: ["hello from the seed"] }],
    });
    if (!created.ok) throw new Error(created.error);
    const doc = new Y.Doc();
    const copy = await openLocalCopy(created.value.id, doc);
    expect(textOf(doc)).toContain("hello from the seed");
    await copy.persistence?.destroy();

    await deleteLocalCopy(created.value.id);
    const empty = new Y.Doc();
    const after = await openLocalCopy(created.value.id, empty);
    expect(textOf(empty)).toBe("");
    await after.persistence?.destroy();
  });
});
