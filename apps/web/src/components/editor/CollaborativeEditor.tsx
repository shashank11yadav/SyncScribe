"use client";

import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { CollaborativeSurface, EditorSkeleton, ReadOnlyNotice } from "@syncscribe/editor";
import { Presence } from "./Presence";
import { useCollaboration } from "./useCollaboration";

export interface CollaborativeEditorProps {
  syncUrl: string;
  documentName: string;
  fetchToken: () => Promise<string>;
  label: string;
  /** Rendered when the server refuses or revokes access. */
  lostAccess: ReactNode;
  onEditor?: (editor: Editor | null) => void;
  aside?: ReactNode;
}

// A placeholder: the sync server overwrites presence with the identity from the signed token.
const CARET_USER = { name: "You", color: "#57534e" };

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
        <CollaborativeSurface
          key={props.documentName}
          doc={session.doc}
          provider={session.provider}
          user={CARET_USER}
          canEdit={access === "read-write"}
          ready={synced}
          label={props.label}
          onEditor={props.onEditor}
          notice={
            access === "readonly" ? (
              <ReadOnlyNotice>You have view-only access. You can read along and export, but not edit.</ReadOnlyNotice>
            ) : null
          }
        />
      ) : (
        <EditorSkeleton />
      )}
    </div>
  );
}
