import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { displayName } from "@syncscribe/shared/identity";

/** Big enough for any document a person would type here, small enough to refuse junk. */
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAX_AWARENESS_CLIENTS = 64;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type DocMessage =
  | { type: "sync-request"; stateVector: Uint8Array }
  | { type: "update"; update: Uint8Array }
  | { type: "awareness"; update: Uint8Array }
  | { type: "awareness-query" };

export type ControlMessage =
  | { type: "document-deleted"; docId: string }
  | { type: "history-changed"; docId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= MAX_MESSAGE_BYTES;
}

/**
 * BroadcastChannel only carries messages from the same origin, but on
 * github.io that origin is shared with every other project page of the same
 * account. Messages are checked against the exact shapes this file sends.
 */
export function parseDocMessage(data: unknown): DocMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "sync-request":
      return isBytes(data.stateVector) ? { type: "sync-request", stateVector: data.stateVector } : null;
    case "update":
    case "awareness":
      return isBytes(data.update) ? { type: data.type, update: data.update } : null;
    case "awareness-query":
      return { type: "awareness-query" };
    default:
      return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseControlMessage(data: unknown): ControlMessage | null {
  if (!isRecord(data) || typeof data.docId !== "string" || !UUID.test(data.docId)) return null;
  if (data.type === "document-deleted" || data.type === "history-changed") return { type: data.type, docId: data.docId };
  return null;
}

function isClockId(value: unknown): value is { client: number; clock: number } {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.client) &&
    (value.client as number) >= 0 &&
    Number.isSafeInteger(value.clock) &&
    (value.clock as number) >= 0
  );
}

/** The JSON form of a Y.RelativePosition, as y-prosemirror writes it for cursors. */
function isRelativePosition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { type, tname, item, assoc } = value;
  if (type !== undefined && type !== null && !isClockId(type)) return false;
  if (tname !== undefined && tname !== null && (typeof tname !== "string" || tname.length > 64)) return false;
  if (item !== undefined && item !== null && !isClockId(item)) return false;
  if (assoc !== undefined && !Number.isSafeInteger(assoc)) return false;
  return true;
}

/**
 * Reduces an awareness state to the fields this app uses, with checked types.
 * Null stays null (that client left); an object keeps only a valid user and,
 * if there is one, a well-formed cursor.
 */
export function sanitizeAwarenessState(state: unknown): Record<string, unknown> | null {
  if (!isRecord(state)) return null;
  const clean: Record<string, unknown> = {};
  const user = state.user;
  if (isRecord(user) && typeof user.name === "string" && user.name.trim() && typeof user.color === "string" && HEX_COLOR.test(user.color)) {
    clean.user = { name: displayName(user.name, "Guest"), color: user.color };
  }
  const cursor = state.cursor;
  if (clean.user && isRecord(cursor) && isRelativePosition(cursor.anchor) && isRelativePosition(cursor.head)) {
    clean.cursor = { anchor: cursor.anchor, head: cursor.head };
  }
  return clean;
}

/**
 * Decodes a y-protocols awareness update, cleans each state, and re-encodes
 * it in the same format. Done before the update is applied because the caret
 * plugin reacts to awareness changes synchronously.
 */
export function sanitizeAwarenessUpdate(update: Uint8Array): Uint8Array | null {
  try {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    if (count > MAX_AWARENESS_CLIENTS) return null;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, count);
    for (let i = 0; i < count; i++) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const state = sanitizeAwarenessState(JSON.parse(decoding.readVarString(decoder)));
      encoding.writeVarUint(encoder, clientId);
      encoding.writeVarUint(encoder, clock);
      encoding.writeVarString(encoder, JSON.stringify(state));
    }
    if (decoding.hasContent(decoder)) return null;
    return encoding.toUint8Array(encoder);
  } catch {
    return null;
  }
}
