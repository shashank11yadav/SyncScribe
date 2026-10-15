import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewDocumentButton } from "@/components/documents/NewDocumentButton";
import { RoleBadge, timeAgo } from "@syncscribe/editor";
import { claimInvites } from "@/server/invites";
import { listDocumentsFor } from "@/server/queries";
import { currentUser } from "@/server/session";

export const metadata: Metadata = { title: "Your documents" };

export default async function DocumentsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin?callbackUrl=/documents");

  await claimInvites(user.id);
  const docs = await listDocumentsFor(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your documents</h1>
          <p className="mt-1 text-ink-muted">Documents you own and documents shared with you.</p>
        </div>
        <NewDocumentButton />
      </div>

      {docs.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-line px-6 py-16 text-center">
          <FileText aria-hidden className="mx-auto size-8 text-ink-muted" />
          <h2 className="mt-4 font-semibold">No documents yet</h2>
          <p className="mt-1 text-ink-muted">Create one, or ask someone to share theirs with your GitHub email.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="flex flex-col gap-1 px-5 py-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{doc.title}</span>
                  <span className="block text-sm text-ink-muted">
                    {doc.role === "owner" ? "Owned by you" : `Owned by ${doc.ownerName ?? "someone"}`} · edited{" "}
                    {timeAgo(doc.updatedAt)}
                  </span>
                </span>
                <RoleBadge role={doc.role} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
