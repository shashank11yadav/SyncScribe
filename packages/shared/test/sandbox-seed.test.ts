import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { EDITOR_FIELD, writeSandboxSeed } from "../src/sandbox-seed";

describe("writeSandboxSeed", () => {
  it("replaces existing content instead of appending", () => {
    const doc = new Y.Doc();
    writeSandboxSeed(doc);
    const first = doc.getXmlFragment(EDITOR_FIELD).toString();
    doc.getXmlFragment(EDITOR_FIELD).insert(0, [new Y.XmlElement("paragraph")]);
    writeSandboxSeed(doc);
    expect(doc.getXmlFragment(EDITOR_FIELD).toString()).toBe(first);
    expect(first).toContain("Welcome to the SyncScribe sandbox");
  });

  it("propagates a reset to a peer that still holds old content", () => {
    const server = new Y.Doc();
    const client = new Y.Doc();
    server.on("update", (u: Uint8Array) => Y.applyUpdate(client, u));
    client.on("update", (u: Uint8Array) => Y.applyUpdate(server, u));
    writeSandboxSeed(server);
    const text = new Y.XmlText();
    text.insert(0, "graffiti");
    const para = new Y.XmlElement("paragraph");
    para.insert(0, [text]);
    client.getXmlFragment(EDITOR_FIELD).push([para]);
    writeSandboxSeed(server);
    expect(client.getXmlFragment(EDITOR_FIELD).toString()).not.toContain("graffiti");
  });
});
