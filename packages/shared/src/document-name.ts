import { z } from "zod";

/**
 * Names the sync server sees. Real documents and the public sandbox live in
 * separate namespaces so a guest token can never address a private document,
 * even if someone guesses its id.
 */
export type DocumentName =
  | { kind: "doc"; docId: string }
  | { kind: "sandbox"; slot: string };

const DOC_PREFIX = "doc:";
const SANDBOX_PREFIX = "sandbox:";

export const SANDBOX_SLOT = "lobby";
export const SANDBOX_DOCUMENT = `${SANDBOX_PREFIX}${SANDBOX_SLOT}`;

const uuid = z.uuid({ version: "v4" });
const slot = z.string().regex(/^[a-z0-9-]{1,32}$/);

export function docDocumentName(docId: string): string {
  return `${DOC_PREFIX}${uuid.parse(docId)}`;
}

export function parseDocumentName(name: string): DocumentName | null {
  if (name.startsWith(DOC_PREFIX)) {
    const parsed = uuid.safeParse(name.slice(DOC_PREFIX.length));
    return parsed.success ? { kind: "doc", docId: parsed.data } : null;
  }
  if (name.startsWith(SANDBOX_PREFIX)) {
    const parsed = slot.safeParse(name.slice(SANDBOX_PREFIX.length));
    return parsed.success ? { kind: "sandbox", slot: parsed.data } : null;
  }
  return null;
}

export const documentNameSchema = z
  .string()
  .max(80)
  .refine((value) => parseDocumentName(value) !== null, "Unknown document name");
