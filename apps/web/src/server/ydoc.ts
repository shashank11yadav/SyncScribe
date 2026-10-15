import "server-only";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { EDITOR_FIELD } from "@syncscribe/shared";
import type { PMNode } from "@syncscribe/shared/markdown";

/** Decodes a stored Yjs update into the ProseMirror JSON the editor understands. */
export function stateToProseMirror(state: Uint8Array | null): PMNode {
  const doc = new Y.Doc();
  if (state && state.byteLength > 0) Y.applyUpdate(doc, state);
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(EDITOR_FIELD)) as PMNode;
  doc.destroy();
  return json;
}
