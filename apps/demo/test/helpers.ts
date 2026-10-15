import * as Y from "yjs";
import { EDITOR_FIELD } from "@syncscribe/shared/sandbox-seed";

/** Lets BroadcastChannel messages and IndexedDB callbacks run. */
export async function settle(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("condition not met in time");
    await settle(10);
  }
}

export function writeParagraph(doc: Y.Doc, text: string): void {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  const fragment = doc.getXmlFragment(EDITOR_FIELD);
  fragment.insert(fragment.length, [paragraph]);
}

export function textOf(doc: Y.Doc): string {
  return doc.getXmlFragment(EDITOR_FIELD).toString();
}

let counter = 0;
export function uniqueChannel(): string {
  counter += 1;
  return `test-channel-${process.pid}-${counter}-${Math.random().toString(36).slice(2)}`;
}
