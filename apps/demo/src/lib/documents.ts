import { z } from "zod";
import { docIdSchema, titleSchema } from "@syncscribe/shared/schemas";
import { DOCUMENTS_KEY } from "./keys";
import { readJson, writeJson, type KeyValueStore } from "./storage";

export const MAX_DOCUMENTS = 50;
export const DEFAULT_TITLE = "Untitled document";

const timestamp = z.number().int().nonnegative().max(8.64e15);

const entrySchema = z.object({
  id: docIdSchema,
  title: titleSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export type DocumentEntry = z.infer<typeof entrySchema>;

/**
 * Reads the document list defensively: a malformed entry is dropped on its
 * own instead of throwing away the whole list.
 */
export function parseDocumentList(raw: unknown): DocumentEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: DocumentEntry[] = [];
  for (const item of raw.slice(0, MAX_DOCUMENTS * 2)) {
    const parsed = entrySchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    entries.push(parsed.data);
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DOCUMENTS);
}

export function loadDocuments(store: KeyValueStore): DocumentEntry[] {
  return parseDocumentList(readJson(store, DOCUMENTS_KEY));
}

function save(store: KeyValueStore, entries: DocumentEntry[]): boolean {
  return writeJson(store, DOCUMENTS_KEY, entries);
}

export type ListResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function createDocument(
  store: KeyValueStore,
  input: { title?: string; id?: string; now?: number } = {},
): ListResult<DocumentEntry> {
  const entries = loadDocuments(store);
  if (entries.length >= MAX_DOCUMENTS) {
    return { ok: false, error: `This demo keeps up to ${MAX_DOCUMENTS} documents. Delete one first.` };
  }
  const title = titleSchema.safeParse(input.title ?? DEFAULT_TITLE);
  if (!title.success) return { ok: false, error: title.error.issues[0]?.message ?? "Invalid title" };
  const now = input.now ?? Date.now();
  const entry: DocumentEntry = { id: input.id ?? crypto.randomUUID(), title: title.data, createdAt: now, updatedAt: now };
  if (!save(store, [entry, ...entries])) return { ok: false, error: "Your browser refused to save the document list." };
  return { ok: true, value: entry };
}

export function renameDocument(store: KeyValueStore, id: string, title: string, now = Date.now()): ListResult<DocumentEntry> {
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid title" };
  const entries = loadDocuments(store);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return { ok: false, error: "That document is no longer in this browser." };
  const next = { ...entry, title: parsed.data, updatedAt: now };
  if (!save(store, entries.map((e) => (e.id === id ? next : e)))) {
    return { ok: false, error: "Your browser refused to save the new title." };
  }
  return { ok: true, value: next };
}

/** Bumps updatedAt so recently edited documents sort first. */
export function touchDocument(store: KeyValueStore, id: string, now = Date.now()): void {
  const entries = loadDocuments(store);
  if (!entries.some((e) => e.id === id)) return;
  save(store, entries.map((e) => (e.id === id ? { ...e, updatedAt: now } : e)));
}

export function removeDocument(store: KeyValueStore, id: string): boolean {
  const entries = loadDocuments(store);
  return save(store, entries.filter((e) => e.id !== id));
}

export function findDocument(store: KeyValueStore, id: string): DocumentEntry | null {
  return loadDocuments(store).find((e) => e.id === id) ?? null;
}
