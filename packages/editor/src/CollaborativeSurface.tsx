"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, type ReactNode } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { EDITOR_FIELD } from "@syncscribe/shared";
import { Toolbar } from "./Toolbar";

/** Anything that carries a Yjs awareness instance: a Hocuspocus provider, or the demo's BroadcastChannel provider. */
export interface AwarenessSource {
  readonly awareness: Awareness | null;
}

export interface CaretUser {
  name: string;
  color: string;
}

export interface CollaborativeSurfaceProps {
  doc: Y.Doc;
  provider: AwarenessSource;
  /** What other people see on this client's caret. */
  user: CaretUser;
  canEdit: boolean;
  /** False until the document has loaded, so nobody types into an empty copy. */
  ready: boolean;
  label: string;
  notice?: ReactNode;
  onEditor?: (editor: Editor | null) => void;
}

/**
 * The editor itself, independent of how updates travel. The full app passes a
 * Hocuspocus provider; the static demo passes a BroadcastChannel one.
 */
export function CollaborativeSurface({ doc, provider, user, canEdit, ready, label, notice, onEditor }: CollaborativeSurfaceProps) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      // Styles live in styles.css so the CSP never has to allow injected <style> tags.
      injectCSS: false,
      editable: false,
      extensions: [
        // Collaboration brings its own Yjs-aware undo, so the default history is off.
        StarterKit.configure({
          undoRedo: false,
          link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
        }),
        Collaboration.configure({ document: doc, field: EDITOR_FIELD }),
        CollaborationCaret.configure({ provider, user }),
        Placeholder.configure({ placeholder: "Start writing…" }),
      ],
      editorProps: {
        attributes: {
          class: "prose-doc",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label,
        },
      },
    },
    // The caret user is read once per document; the full app's sync server overwrites it anyway.
    [doc, provider],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit && ready);
    editor.view.dom.setAttribute("aria-readonly", String(!canEdit));
  }, [editor, canEdit, ready]);

  useEffect(() => {
    onEditor?.(editor);
  }, [editor, onEditor]);

  useEffect(() => () => onEditor?.(null), [onEditor]);

  return (
    <div className="flex flex-col gap-3">
      {editor && canEdit ? <Toolbar editor={editor} /> : null}
      {notice}
      <div className="rounded-xl border border-line bg-surface px-5 py-6 shadow-sm sm:px-10 sm:py-10">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
