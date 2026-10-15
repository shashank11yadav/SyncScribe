import * as Y from "yjs";

/** The Yjs fragment the editor binds to. Must match the Collaboration extension config. */
export const EDITOR_FIELD = "default";

type Inline = string | { text: string; marks: Record<string, Record<string, unknown>> };

function paragraph(type: string, inline: Inline[], attrs: Record<string, string | number> = {}): Y.XmlElement {
  const element = new Y.XmlElement(type);
  for (const [key, value] of Object.entries(attrs)) {
    // y-prosemirror stores node attributes as plain values on the element.
    element.setAttribute(key, value as unknown as string);
  }
  const text = new Y.XmlText();
  const markNames = new Set(inline.flatMap((part) => (typeof part === "string" ? [] : Object.keys(part.marks))));
  let offset = 0;
  for (const part of inline) {
    const value = typeof part === "string" ? part : part.text;
    // Yjs carries formatting over from the preceding character unless every
    // mark is set explicitly, so unmarked runs pass null for each one.
    const format: Record<string, unknown> = {};
    for (const name of markNames) format[name] = typeof part === "string" ? null : (part.marks[name] ?? null);
    text.insert(offset, value, format);
    offset += value.length;
  }
  element.insert(0, [text]);
  return element;
}

function bulletList(items: Inline[][]): Y.XmlElement {
  const list = new Y.XmlElement("bulletList");
  list.insert(
    0,
    items.map((inline) => {
      const item = new Y.XmlElement("listItem");
      item.insert(0, [paragraph("paragraph", inline)]);
      return item;
    }),
  );
  return list;
}

/**
 * Replaces the sandbox content with the welcome text. This runs as a normal
 * Yjs transaction rather than by deleting stored state: clients that are still
 * connected hold their own copy of the document and would merge the old
 * content straight back if the server simply forgot it.
 */
export function writeSandboxSeed(doc: Y.Doc): void {
  const fragment = doc.getXmlFragment(EDITOR_FIELD);
  doc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    fragment.insert(0, [
      paragraph("heading", ["Welcome to the SyncScribe sandbox"], { level: 1 }),
      paragraph("paragraph", [
        "This page is public and anyone can edit it. It resets to this text every 30 minutes, so feel free to make a mess.",
      ]),
      paragraph("heading", ["Things to try"], { level: 2 }),
      bulletList([
        ["Open this page in a second window and type in both. Each cursor carries its owner's name."],
        ["Use the toolbar or ", { text: "Markdown shortcuts", marks: { bold: {} } }, " like ", { text: "## ", marks: { code: {} } }, " and ", { text: "- ", marks: { code: {} } }, "."],
        ["Sign in with GitHub to create private documents, share them with roles, and restore older versions."],
      ]),
    ]);
  }, "sandbox-reset");
}
