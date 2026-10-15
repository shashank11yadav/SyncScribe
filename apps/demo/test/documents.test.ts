import { describe, expect, it } from "vitest";
import {
  DEFAULT_TITLE,
  MAX_DOCUMENTS,
  createDocument,
  findDocument,
  loadDocuments,
  parseDocumentList,
  removeDocument,
  renameDocument,
  touchDocument,
} from "../src/lib/documents";
import { DOCUMENTS_KEY } from "../src/lib/keys";
import { memoryStore, type KeyValueStore } from "../src/lib/storage";

const ID_A = "3b241101-e2bb-4255-8caf-4136c566a962";
const ID_B = "9f1c2e3d-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

describe("parseDocumentList", () => {
  it("keeps valid entries newest first and drops the rest one by one", () => {
    const list = parseDocumentList([
      { id: ID_A, title: "Older", createdAt: 1, updatedAt: 10 },
      { id: "not-a-uuid", title: "Bad id", createdAt: 1, updatedAt: 1 },
      { id: ID_B, title: "Newer", createdAt: 2, updatedAt: 20, extra: "<script>" },
      { id: ID_A, title: "Duplicate", createdAt: 1, updatedAt: 30 },
      { id: "11111111-1111-4111-8111-111111111111", title: "", createdAt: 1, updatedAt: 1 },
      { id: "22222222-2222-4222-8222-222222222222", title: "x".repeat(121), createdAt: 1, updatedAt: 1 },
      { id: "33333333-3333-4333-8333-333333333333", title: "Negative", createdAt: -5, updatedAt: 1 },
      "junk",
      null,
    ]);
    expect(list).toEqual([
      { id: ID_B, title: "Newer", createdAt: 2, updatedAt: 20 },
      { id: ID_A, title: "Older", createdAt: 1, updatedAt: 10 },
    ]);
  });

  it("treats non-arrays as an empty list", () => {
    for (const raw of [null, {}, "[]", 42]) expect(parseDocumentList(raw)).toEqual([]);
  });

  it("caps the list length", () => {
    const many = Array.from({ length: MAX_DOCUMENTS + 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `Doc ${i}`,
      createdAt: i,
      updatedAt: i,
    }));
    expect(parseDocumentList(many)).toHaveLength(MAX_DOCUMENTS);
  });
});

describe("document list operations", () => {
  it("creates, renames, touches and removes", () => {
    const store = memoryStore();
    const created = createDocument(store, { id: ID_A, now: 100 });
    expect(created).toEqual({ ok: true, value: { id: ID_A, title: DEFAULT_TITLE, createdAt: 100, updatedAt: 100 } });

    expect(renameDocument(store, ID_A, "  Launch plan  ", 200)).toMatchObject({ ok: true, value: { title: "Launch plan", updatedAt: 200 } });
    touchDocument(store, ID_A, 300);
    expect(findDocument(store, ID_A)?.updatedAt).toBe(300);

    expect(removeDocument(store, ID_A)).toBe(true);
    expect(loadDocuments(store)).toEqual([]);
  });

  it("validates titles with the full app's rules", () => {
    const store = memoryStore();
    createDocument(store, { id: ID_A });
    expect(renameDocument(store, ID_A, "   ")).toEqual({ ok: false, error: "Title cannot be empty" });
    expect(renameDocument(store, ID_A, "x".repeat(121))).toEqual({ ok: false, error: "Title is too long" });
    expect(createDocument(store, { title: "" })).toEqual({ ok: false, error: "Title cannot be empty" });
  });

  it("refuses to rename a document that is not in the list", () => {
    expect(renameDocument(memoryStore(), ID_B, "Hello").ok).toBe(false);
  });

  it("stops at the document limit", () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_DOCUMENTS; i++) expect(createDocument(store).ok).toBe(true);
    expect(createDocument(store).ok).toBe(false);
  });

  it("survives storage that throws, and garbage written by another page", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(loadDocuments(throwing)).toEqual([]);
    expect(createDocument(throwing)).toEqual({ ok: false, error: "Your browser refused to save the document list." });

    const store = memoryStore();
    store.setItem(DOCUMENTS_KEY, "{not json");
    expect(loadDocuments(store)).toEqual([]);
  });
});
