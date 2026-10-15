import * as Y from "yjs";

/** The Yjs fragment the editor binds to. Must match the Collaboration extension config. */
export const EDITOR_FIELD = "default";

/** A run of text, optionally with marks such as `{ bold: {} }`. */
export type SeedInline = string | { text: string; marks: Record<string, Record<string, unknown>> };

export type SeedBlock =
  | { type: "heading"; level: 1 | 2 | 3; inline: SeedInline[] }
  | { type: "paragraph"; inline: SeedInline[] }
  | { type: "bulletList"; items: SeedInline[][] };

function paragraph(type: string, inline: SeedInline[], attrs: Record<string, string | number> = {}): Y.XmlElement {
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

function bulletList(items: SeedInline[][]): Y.XmlElement {
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

function toElement(block: SeedBlock): Y.XmlElement {
  switch (block.type) {
    case "heading":
      return paragraph("heading", block.inline, { level: block.level });
    case "paragraph":
      return paragraph("paragraph", block.inline);
    case "bulletList":
      return bulletList(block.items);
  }
}

/**
 * Replaces whatever the editor fragment holds with `blocks`, in one Yjs
 * transaction tagged with `origin`.
 */
export function writeSeed(doc: Y.Doc, blocks: SeedBlock[], origin: string): void {
  const fragment = doc.getXmlFragment(EDITOR_FIELD);
  doc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    fragment.insert(0, blocks.map(toElement));
  }, origin);
}

const SANDBOX_SEED: SeedBlock[] = [
  { type: "heading", level: 1, inline: ["Welcome to the SyncScribe sandbox"] },
  {
    type: "paragraph",
    inline: [
      "This page is public and anyone can edit it. It resets to this text every 30 minutes, so feel free to make a mess.",
    ],
  },
  { type: "heading", level: 2, inline: ["Things to try"] },
  {
    type: "bulletList",
    items: [
      ["Open this page in a second window and type in both. Each cursor carries its owner's name."],
      ["Use the toolbar or ", { text: "Markdown shortcuts", marks: { bold: {} } }, " like ", { text: "## ", marks: { code: {} } }, " and ", { text: "- ", marks: { code: {} } }, "."],
      ["Sign in with GitHub to create private documents, share them with roles, and restore older versions."],
    ],
  },
];

/**
 * Replaces the sandbox content with the welcome text. This runs as a normal
 * Yjs transaction rather than by deleting stored state: clients that are still
 * connected hold their own copy of the document and would merge the old
 * content straight back if the server simply forgot it.
 */
export function writeSandboxSeed(doc: Y.Doc): void {
  writeSeed(doc, SANDBOX_SEED, "sandbox-reset");
}
