import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { beforeEach, describe, expect, it } from "vitest";
import { HistoryStore, MAX_VERSIONS_PER_DOC } from "../src/lib/history";
import { HISTORY_DB } from "../src/lib/keys";
import { textOf, writeParagraph } from "./helpers";

const DOC = "3b241101-e2bb-4255-8caf-4136c566a962";
const OTHER = "9f1c2e3d-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

let factory: IDBFactory;
let store: HistoryStore;

beforeEach(() => {
  factory = new IDBFactory();
  store = new HistoryStore(factory);
});

function docWith(text: string): Y.Doc {
  const doc = new Y.Doc();
  writeParagraph(doc, text);
  return doc;
}

describe("HistoryStore", () => {
  it("saves versions and lists them newest first, per document", async () => {
    const doc = docWith("first");
    await store.save(DOC, doc, { kind: "manual", author: "Guest Otter", now: 1 });
    writeParagraph(doc, "second");
    await store.save(DOC, doc, { kind: "auto", author: "Guest Otter", now: 2 });
    await store.save(OTHER, docWith("elsewhere"), { kind: "manual", author: "Guest Wren", now: 3 });

    const versions = await store.list(DOC);
    expect(versions.map((v) => [v.createdAt, v.kind])).toEqual([
      [2, "auto"],
      [1, "manual"],
    ]);
    expect(versions[0]).not.toHaveProperty("state");
  });

  it("returns the stored state so a version can be previewed", async () => {
    const doc = docWith("keep this");
    const result = await store.save(DOC, doc, { kind: "manual", author: "Guest Otter" });
    if (!result.saved) throw new Error("expected a save");
    const record = await store.get(DOC, result.version.id);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, record!.state);
    expect(textOf(restored)).toContain("keep this");
  });

  it("will not hand a version to a different document", async () => {
    const result = await store.save(DOC, docWith("private"), { kind: "manual", author: "Guest Otter" });
    if (!result.saved) throw new Error("expected a save");
    expect(await store.get(OTHER, result.version.id)).toBeNull();
  });

  it("skips a save when the content has not changed", async () => {
    const doc = docWith("same");
    await store.save(DOC, doc, { kind: "manual", author: "a" });
    expect(await store.save(DOC, doc, { kind: "auto", author: "a" })).toEqual({ saved: false, reason: "unchanged" });

    // The same text typed in another tab encodes differently but is still the same content.
    const twin = docWith("same");
    expect(await store.save(DOC, twin, { kind: "auto", author: "b" })).toEqual({ saved: false, reason: "unchanged" });
  });

  it("keeps at most the newest versions per document", async () => {
    const doc = new Y.Doc();
    for (let i = 0; i < MAX_VERSIONS_PER_DOC + 5; i++) {
      writeParagraph(doc, `line ${i}`);
      await store.save(DOC, doc, { kind: "auto", author: "a", now: i });
    }
    const versions = await store.list(DOC);
    expect(versions).toHaveLength(MAX_VERSIONS_PER_DOC);
    expect(versions.at(-1)?.createdAt).toBe(5);
  });

  it("ignores records that fail validation", async () => {
    await store.save(DOC, docWith("good"), { kind: "manual", author: "a", now: 5 });
    await store.close();

    // Another page on the same origin writes junk into the database.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(HISTORY_DB, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("versions", "readwrite");
    const versions = tx.objectStore("versions");
    versions.put({ id: "11111111-1111-4111-8111-111111111111", docId: DOC, createdAt: 6, kind: "auto", author: "x", state: "not bytes" });
    versions.put({ id: "22222222-2222-4222-8222-222222222222", docId: DOC, createdAt: 7, kind: "evil", author: "x", state: new Uint8Array([1]) });
    versions.put({ id: "not-a-uuid", docId: DOC, createdAt: 8, kind: "auto", author: "x", state: new Uint8Array([1]) });
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();

    const reopened = new HistoryStore(factory);
    expect((await reopened.list(DOC)).map((v) => v.createdAt)).toEqual([5]);
    expect(await reopened.get(DOC, "22222222-2222-4222-8222-222222222222")).toBeNull();
    await reopened.close();
  });

  it("removes every version of one document only", async () => {
    await store.save(DOC, docWith("a"), { kind: "manual", author: "a" });
    await store.save(OTHER, docWith("b"), { kind: "manual", author: "a" });
    await store.removeAll(DOC);
    expect(await store.list(DOC)).toEqual([]);
    expect(await store.list(OTHER)).toHaveLength(1);
  });

  it("rejects cleanly when IndexedDB is missing", async () => {
    const missing = new HistoryStore(null);
    await expect(missing.list(DOC)).rejects.toThrow("IndexedDB is not available");
  });
});
