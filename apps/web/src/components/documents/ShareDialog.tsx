"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { can, canChangeRole, canRemoveMember, canTransferTo, type Role, type ShareRole } from "@syncscribe/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { deleteDocument, leaveDocument, transferOwnership } from "@/server/actions/documents";
import { changeMemberRole, removeMember, revokeInvite, shareDocument } from "@/server/actions/sharing";
import type { ActionResult } from "@/server/result";

export interface MemberItem {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
}

export interface InviteItem {
  id: string;
  email: string;
  role: ShareRole;
  createdAt: string;
}

type Feedback = { tone: "ok" | "error"; text: string } | null;

/**
 * Buttons are shown or hidden from the same shared rules the server enforces,
 * but hiding them is only a courtesy. Every action re-checks on the server.
 */
export function ShareDialog({
  open,
  onClose,
  docId,
  role,
  currentUserId,
  members,
  invites,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  role: Role;
  currentUserId: string;
  members: MemberItem[];
  invites: InviteItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [email, setEmail] = useState("");
  const [shareRole, setShareRole] = useState<ShareRole>("editor");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const emailId = useId();
  const roleId = useId();

  function run<T>(action: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) {
    startTransition(async () => {
      setFeedback(null);
      const result = await action();
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.error });
        return;
      }
      onOk?.(result.data);
      router.refresh();
    });
  }

  function onShare(event: FormEvent) {
    event.preventDefault();
    run(
      () => shareDocument({ docId, email, role: shareRole }),
      (data) => {
        setEmail("");
        setFeedback({ tone: "ok", text: data.message });
      },
    );
  }

  const me = { id: currentUserId, role };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share"
      description={can(role, "doc.share") ? "Invite people by the email on their GitHub account." : "People with access to this document."}
    >
      {can(role, "doc.share") ? (
        <form onSubmit={onShare} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={emailId} className="text-sm font-medium">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="min-h-10 rounded-md border border-line bg-surface px-3"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={roleId} className="text-sm font-medium">
              Role
            </label>
            <select
              id={roleId}
              value={shareRole}
              onChange={(e) => setShareRole(e.target.value as ShareRole)}
              className="min-h-10 rounded-md border border-line bg-surface px-2"
            >
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={pending}>
            Invite
          </Button>
        </form>
      ) : null}

      <p role="status" aria-live="polite" className={`mt-3 min-h-5 text-sm ${feedback?.tone === "error" ? "text-danger" : "text-accent"}`}>
        {feedback?.text}
      </p>

      <h3 className="mt-4 text-sm font-semibold">Members</h3>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
        {members.map((member) => {
          const label = member.name ?? member.email ?? "Unknown";
          const isMe = member.userId === currentUserId;
          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Avatar name={label} image={member.image} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {label}
                  {isMe ? <span className="text-ink-muted"> (you)</span> : null}
                </p>
                {member.email ? <p className="truncate text-xs text-ink-muted">{member.email}</p> : null}
              </div>
              {member.role !== "owner" && canChangeRole(role, member.role, member.role === "editor" ? "viewer" : "editor") ? (
                <select
                  aria-label={`Role for ${label}`}
                  value={member.role}
                  disabled={pending}
                  onChange={(e) => run(() => changeMemberRole({ docId, userId: member.userId, role: e.target.value }))}
                  className="min-h-9 rounded-md border border-line bg-surface px-2 text-sm"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">View only</option>
                </select>
              ) : (
                <RoleBadge role={member.role} />
              )}
              {canTransferTo(role, member.role) ? (
                <Button
                  variant="ghost"
                  className="min-h-9 text-xs"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Make ${label} the owner? You will become an editor.`)) {
                      run(() => transferOwnership({ docId, userId: member.userId }));
                    }
                  }}
                >
                  Make owner
                </Button>
              ) : null}
              {canRemoveMember(me, { id: member.userId, role: member.role }) ? (
                <Button
                  variant="ghost"
                  className="min-h-9 text-xs text-danger"
                  disabled={pending}
                  onClick={() => {
                    if (isMe) {
                      if (window.confirm("Leave this document? You will lose access.")) {
                        run(() => leaveDocument({ docId }), () => router.push("/documents"));
                      }
                    } else {
                      run(() => removeMember({ docId, userId: member.userId }));
                    }
                  }}
                >
                  {isMe ? "Leave" : "Remove"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {can(role, "doc.viewInvites") && invites.length > 0 ? (
        <>
          <h3 className="mt-5 text-sm font-semibold">Pending invitations</h3>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <p className="min-w-0 flex-1 truncate text-sm">{invite.email}</p>
                <RoleBadge role={invite.role} />
                {can(role, "doc.revokeInvite") ? (
                  <Button
                    variant="ghost"
                    className="min-h-9 text-xs text-danger"
                    disabled={pending}
                    onClick={() => run(() => revokeInvite({ docId, inviteId: invite.id }))}
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {can(role, "doc.delete") ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger-soft p-3">
          <h3 className="text-sm font-semibold text-danger">Delete document</h3>
          <p className="mt-1 text-sm text-ink-muted">Removes the document, its history and everyone&apos;s access.</p>
          {confirmDelete ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => run(() => deleteDocument({ docId }), () => router.push("/documents"))}
              >
                Yes, delete it
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="mt-3" onClick={() => setConfirmDelete(true)}>
              Delete…
            </Button>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
