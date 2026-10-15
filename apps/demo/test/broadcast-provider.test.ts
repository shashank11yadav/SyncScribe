import { encodeAwarenessUpdate, Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { BroadcastProvider } from "../src/lib/broadcast-provider";
import { settle, textOf, uniqueChannel, waitFor, writeParagraph } from "./helpers";

const open: BroadcastProvider[] = [];
const channels: BroadcastChannel[] = [];

function tab(channel: string, doc = new Y.Doc()): BroadcastProvider {
  const provider = new BroadcastProvider(doc, channel);
  open.push(provider);
  return provider;
}

function rawChannel(name: string): BroadcastChannel {
  const channel = new BroadcastChannel(name);
  channels.push(channel);
  return channel;
}

afterEach(() => {
  for (const provider of open.splice(0)) provider.destroy();
  for (const channel of channels.splice(0)) channel.close();
});

describe("BroadcastProvider", () => {
  it("sends edits from one tab to another", async () => {
    const name = uniqueChannel();
    const a = tab(name);
    const b = tab(name);
    a.connect();
    b.connect();
    writeParagraph(a.doc, "typed in tab A");
    await waitFor(() => textOf(b.doc).includes("typed in tab A"));
    writeParagraph(b.doc, "and tab B answers");
    await waitFor(() => textOf(a.doc).includes("and tab B answers"));
    expect(textOf(a.doc)).toBe(textOf(b.doc));
  });

  it("brings a tab that joins late up to date, in both directions", async () => {
    const name = uniqueChannel();
    const a = tab(name);
    a.connect();
    writeParagraph(a.doc, "written before B opened");

    // B has its own offline edit, as if loaded from IndexedDB.
    const docB = new Y.Doc();
    writeParagraph(docB, "B's saved edit");
    const b = tab(name, docB);
    b.connect();

    await waitFor(() => textOf(b.doc).includes("written before B opened") && textOf(a.doc).includes("B's saved edit"));
    expect(textOf(a.doc)).toBe(textOf(b.doc));
  });

  it("merges concurrent edits made while the tabs were apart", async () => {
    const name = uniqueChannel();
    const a = tab(name);
    const b = tab(name);
    writeParagraph(a.doc, "left");
    writeParagraph(b.doc, "right");
    a.connect();
    b.connect();
    await waitFor(() => textOf(a.doc) === textOf(b.doc) && textOf(a.doc).includes("left") && textOf(a.doc).includes("right"));
  });

  it("shares presence and removes it when a tab closes", async () => {
    const name = uniqueChannel();
    const a = tab(name);
    const b = tab(name);
    a.awareness.setLocalStateField("user", { name: "Guest Otter", color: "#027a48" });
    a.connect();
    b.connect();
    await waitFor(() => (b.awareness.getStates().get(a.doc.clientID) as { user?: { name: string } } | undefined)?.user?.name === "Guest Otter");

    a.destroy();
    await waitFor(() => !b.awareness.getStates().has(a.doc.clientID));
  });

  it("does not echo remote updates back onto the channel", async () => {
    const name = uniqueChannel();
    const a = tab(name);
    const b = tab(name);
    a.connect();
    b.connect();
    await settle();

    const spy = rawChannel(name);
    let updates = 0;
    spy.onmessage = (event: MessageEvent) => {
      if ((event.data as { type?: string }).type === "update") updates++;
    };
    writeParagraph(a.doc, "once");
    await waitFor(() => textOf(b.doc).includes("once"));
    await settle(50);
    expect(updates).toBe(1);
  });

  it("ignores malformed messages and corrupt Yjs bytes", async () => {
    const name = uniqueChannel();
    const b = tab(name);
    b.connect();
    writeParagraph(b.doc, "still here");

    const attacker = rawChannel(name);
    attacker.postMessage("hello");
    attacker.postMessage({ type: "update", update: "not bytes" });
    attacker.postMessage({ type: "update", update: new Uint8Array([255, 255, 255, 255, 1, 2, 3]) });
    attacker.postMessage({ type: "sync-request", stateVector: new Uint8Array([200, 200, 200]) });
    attacker.postMessage({ type: "awareness", update: new Uint8Array([9, 9, 9]) });
    attacker.postMessage({ type: "delete-everything" });
    await waitFor(() => b.rejected >= 5);
    expect(textOf(b.doc)).toContain("still here");
  });

  it("strips unexpected fields and bad colours from remote presence before applying it", async () => {
    const name = uniqueChannel();
    const b = tab(name);
    b.connect();

    const fakeDoc = new Y.Doc();
    const fake = new Awareness(fakeDoc);
    fake.setLocalState({
      user: { name: "Mallory", color: "red; background:url(https://example.com/x)" },
      cursor: { anchor: "nope", head: 1 },
      extra: "x".repeat(1000),
    });
    rawChannel(name).postMessage({ type: "awareness", update: encodeAwarenessUpdate(fake, [fakeDoc.clientID]) });
    await waitFor(() => b.awareness.getStates().has(fakeDoc.clientID));
    expect(b.awareness.getStates().get(fakeDoc.clientID)).toEqual({});
    fake.destroy();
  });
});
