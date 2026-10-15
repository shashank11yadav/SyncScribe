"use client";

import type { Editor } from "@tiptap/react";
import { Download, History, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { can, docDocumentName, type Role } from "@syncscribe/shared";
import { CollaborativeEditor } from "@/components/editor/CollaborativeEditor";
import { TokenRequestError, type AccessState } from "@/components/editor/useCollaboration";
import { Button, buttonClasses } from "@/components/ui/Button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { HistoryDialog } from "./HistoryDialog";
import { ShareDialog, type InviteItem, type MemberItem } from "./ShareDialog";
import { TitleField } from "./TitleField";

export function DocumentWorkspace({
  docId,
  initialTitle,
  initialRole,
  currentUserId,
  members,
  invites,
  syncUrl,
}: {
  docId: string;
  initialTitle: string;
  initialRole: Role;
  currentUserId: string;
  members: MemberItem[];
  invites: InviteItem[];
  syncUrl: string;
}) {
  const router = useRouter();
  // Display only. The server decides what this user may do on every request.
  const [role, setRole] = useState<Role>(initialRole);
  const roleRef = useRef<Role>(initialRole);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [panel, setPanel] = useState<"share" | "history" | null>(null);

  const fetchToken = useCallback(async () => {
    const res = await fetch(`/api/documents/${docId}/token`, { method: "POST" });
    if (!res.ok) throw new TokenRequestError(res.status);
    const body = (await res.json()) as { token: string; role: Role };
    if (roleRef.current !== body.role) {
      // The role changed since the page loaded: refresh members and controls.
      roleRef.current = body.role;
      setRole(body.role);
      router.refresh();
    }
    return body.token;
  }, [docId, router]);

  const onEditor = useCallback((next: Editor | null, _access: AccessState) => setEditor(next), []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TitleField docId={docId} initialTitle={initialTitle} editable={can(role, "doc.rename")} />
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={role} />
          <Button onClick={() => setPanel("share")}>
            <Users aria-hidden className="size-4" />
            {can(role, "doc.share") ? "Share" : "People"}
          </Button>
          {can(role, "doc.history") ? (
            <Button onClick={() => setPanel("history")}>
              <History aria-hidden className="size-4" />
              History
            </Button>
          ) : null}
          <a href={`/api/documents/${docId}/export`} className={buttonClasses("secondary")} download>
            <Download aria-hidden className="size-4" />
            <span>
              Export<span className="sr-only"> as Markdown</span>
            </span>
          </a>
        </div>
      </div>

      <div className="mt-4">
        <CollaborativeEditor
          syncUrl={syncUrl}
          documentName={docDocumentName(docId)}
          fetchToken={fetchToken}
          label="Document body"
          onEditor={onEditor}
          lostAccess={
            <div role="alert" className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
              <h2 className="text-lg font-semibold">You no longer have access to this document</h2>
              <p className="mt-2 text-ink-muted">It may have been deleted, or the owner removed you.</p>
              <Link href="/documents" className={buttonClasses("primary", "mt-6")}>
                Back to your documents
              </Link>
            </div>
          }
        />
      </div>

      <ShareDialog
        open={panel === "share"}
        onClose={() => setPanel(null)}
        docId={docId}
        role={role}
        currentUserId={currentUserId}
        members={members}
        invites={invites}
      />
      {can(role, "doc.history") ? (
        <HistoryDialog open={panel === "history"} onClose={() => setPanel(null)} docId={docId} liveEditor={editor} />
      ) : null}
    </div>
  );
}
