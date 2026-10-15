import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as decoding from "lib0/decoding";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_BYTES,
  parseControlMessage,
  parseDocMessage,
  sanitizeAwarenessState,
  sanitizeAwarenessUpdate,
} from "../src/lib/messages";

const bytes = new Uint8Array([1, 2, 3]);

describe("parseDocMessage", () => {
  it("accepts the four message shapes", () => {
    expect(parseDocMessage({ type: "update", update: bytes })).toEqual({ type: "update", update: bytes });
    expect(parseDocMessage({ type: "awareness", update: bytes })).toEqual({ type: "awareness", update: bytes });
    expect(parseDocMessage({ type: "sync-request", stateVector: bytes })).toEqual({ type: "sync-request", stateVector: bytes });
    expect(parseDocMessage({ type: "awareness-query" })).toEqual({ type: "awareness-query" });
  });

  it("drops extra fields", () => {
    expect(parseDocMessage({ type: "update", update: bytes, role: "owner" })).toEqual({ type: "update", update: bytes });
  });

  it("rejects anything else", () => {
    for (const bad of [
      null,
      "update",
      [],
      { type: "update" },
      { type: "update", update: [1, 2, 3] },
      { type: "update", update: new Uint8Array() },
      { type: "update", update: new Uint8Array(MAX_MESSAGE_BYTES + 1) },
      { type: "sync-request", stateVector: "abc" },
      { type: "__proto__" },
    ]) {
      expect(parseDocMessage(bad)).toBeNull();
    }
  });
});

describe("parseControlMessage", () => {
  const docId = "3b241101-e2bb-4255-8caf-4136c566a962";
  it("accepts known notices for a valid document id", () => {
    expect(parseControlMessage({ type: "document-deleted", docId })).toEqual({ type: "document-deleted", docId });
    expect(parseControlMessage({ type: "history-changed", docId })).toEqual({ type: "history-changed", docId });
  });
  it("rejects unknown types and malformed ids", () => {
    expect(parseControlMessage({ type: "wipe", docId })).toBeNull();
    expect(parseControlMessage({ type: "document-deleted", docId: "../../etc" })).toBeNull();
    expect(parseControlMessage({ type: "document-deleted" })).toBeNull();
  });
});

describe("sanitizeAwarenessState", () => {
  const anchor = { type: { client: 1, clock: 2 }, tname: null, item: { client: 1, clock: 5 }, assoc: 0 };

  it("keeps a valid user and cursor", () => {
    expect(sanitizeAwarenessState({ user: { name: "Ada", color: "#027a48" }, cursor: { anchor, head: anchor } })).toEqual({
      user: { name: "Ada", color: "#027a48" },
      cursor: { anchor, head: anchor },
    });
  });

  it("drops users with bad colours and cursors without a user", () => {
    expect(sanitizeAwarenessState({ user: { name: "Ada", color: "javascript:alert(1)" }, cursor: { anchor, head: anchor } })).toEqual({});
  });

  it("drops malformed cursors", () => {
    const user = { name: "Ada", color: "#027a48" };
    expect(sanitizeAwarenessState({ user, cursor: { anchor: { item: { client: -1, clock: 0 } }, head: anchor } })).toEqual({ user });
    expect(sanitizeAwarenessState({ user, cursor: "x" })).toEqual({ user });
  });

  it("caps long names and keeps null as a removal", () => {
    expect(sanitizeAwarenessState({ user: { name: "n".repeat(500), color: "#027a48" } })?.user).toEqual({ name: "n".repeat(80), color: "#027a48" });
    expect(sanitizeAwarenessState(null)).toBeNull();
  });
});

describe("sanitizeAwarenessUpdate", () => {
  it("round-trips a clean update with the same client and clock", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState({ user: { name: "Ada", color: "#027a48" }, junk: true });
    const clean = sanitizeAwarenessUpdate(encodeAwarenessUpdate(awareness, [doc.clientID]));
    expect(clean).not.toBeNull();
    const decoder = decoding.createDecoder(clean!);
    expect(decoding.readVarUint(decoder)).toBe(1);
    expect(decoding.readVarUint(decoder)).toBe(doc.clientID);
    expect(decoding.readVarUint(decoder)).toBe(awareness.meta.get(doc.clientID)!.clock);
    expect(JSON.parse(decoding.readVarString(decoder))).toEqual({ user: { name: "Ada", color: "#027a48" } });
    awareness.destroy();
  });

  it("rejects truncated, padded and non-JSON updates", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState({ user: { name: "Ada", color: "#027a48" } });
    const update = encodeAwarenessUpdate(awareness, [doc.clientID]);
    expect(sanitizeAwarenessUpdate(update.slice(0, update.length - 3))).toBeNull();
    expect(sanitizeAwarenessUpdate(new Uint8Array([...update, 0]))).toBeNull();
    expect(sanitizeAwarenessUpdate(new Uint8Array([1, 1, 1, 3, 123, 123, 123]))).toBeNull();
    expect(sanitizeAwarenessUpdate(new Uint8Array([200]))).toBeNull();
    awareness.destroy();
  });
});
