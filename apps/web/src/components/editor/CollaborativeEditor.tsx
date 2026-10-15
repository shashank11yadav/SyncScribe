"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, type ReactNode } from "react";
import type * as Y from "yjs";
import { EDITOR_FIELD } from "@syncscribe/shared";
import { Presence } from "./Presence";
import { Toolbar } from "./Toolbar";
import { useCollaboration, type AccessState } from "./useCollaboration";

export interface CollaborativeEditorProps {
  syncUrl: string;
  documentName: string;
  fetchToken: () => Promise<string>;
  label: string;
  /** Rendered when the server refuses or revokes access. */
  lostAccess: ReactNode;
  onEditor?: (editor: Editor | null, access: AccessState) => void;
  aside?: ReactNode;
}

export function CollaborativeEditor(props: CollaborativeEditorProps) {
  const { session, status, access, synced, peers } = useCollaboration({
    syncUrl: props.syncUrl,
    documentName: props.documentName,
    fetchToken: props.fetchToken,
  });

  if (access === "lost") return <>{props.lostAccess}</>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Presence peers={peers} status={status} synced={synced} />
        {props.aside}
      </div>
      {session ? (
        <EditorSurface
          key={props.documentName}
          doc={session.doc}
          provider={session.provider}
          access={access}
          synced={synced}
          label={props.label}
          onEditor={props.onEditor}
        />
      ) : (
        <EditorSkeleton />
      )}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div aria-hidden className="min-h-[55vh] animate-pulse rounded-xl border border-line bg-surface p-8">
      <div className="h-6 w-1/3 rounded bg-surface-muted" />
      <div className="mt-6 h-4 w-5/6 rounded bg-surface-muted" />
      <div className="mt-3 h-4 w-2/3 rounded bg-surface-muted" />
    </div>
  );
}

function EditorSurface({
  doc,
  provider,
  access,
  synced,
  label,
  onEditor,
}: {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  access: AccessState;
  synced: boolean;
  label: string;
  onEditor?: (editor: Editor | null, access: AccessState) => void;
}) {
  const canEdit = access === "read-write";

  const editor = useEditor(
    {
      immediatelyRender: false,
      // Styles live in globals.css so the CSP never has to allow injected <style> tags.
      injectCSS: false,
      editable: false,
      extensions: [
        // Collaboration brings its own Yjs-aware undo, so the default history is off.
        StarterKit.configure({
          undoRedo: false,
          link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
        }),
        Collaboration.configure({ document: doc, field: EDITOR_FIELD }),
        // The name and colour here are placeholders: the sync server overwrites
        // presence with the identity from the signed token.
        CollaborationCaret.configure({ provider, user: { name: "You", color: "#57534e" } }),
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
    [doc, provider],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit && synced);
    editor.view.dom.setAttribute("aria-readonly", String(!canEdit));
  }, [editor, canEdit, synced]);

  useEffect(() => {
    onEditor?.(editor, access);
  }, [editor, access, onEditor]);

  useEffect(() => () => onEditor?.(null, "pending"), [onEditor]);

  return (
    <div className="flex flex-col gap-3">
      {editor && canEdit ? <Toolbar editor={editor} /> : null}
      {access === "readonly" ? (
        <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted">
          You have view-only access. You can read along and export, but not edit.
        </p>
      ) : null}
      <div className="rounded-xl border border-line bg-surface px-5 py-6 shadow-sm sm:px-10 sm:py-10">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
