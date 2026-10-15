import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { can, docIdSchema } from "@syncscribe/shared";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import { getRole } from "@/server/access";
import { claimInvites } from "@/server/invites";
import { getDocumentMeta, listInvites, listMembers } from "@/server/queries";
import { currentUser } from "@/server/session";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const parsed = docIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const user = await currentUser();
  if (!user) redirect(`/signin?callbackUrl=/documents/${parsed.data}` as "/signin");

  // Someone opening a link they were invited to should get in straight away.
  await claimInvites(user.id);
  const role = await getRole(parsed.data, user.id);
  if (!role) notFound();

  const [meta, members, invites] = await Promise.all([
    getDocumentMeta(parsed.data),
    listMembers(parsed.data),
    can(role, "doc.viewInvites") ? listInvites(parsed.data) : Promise.resolve([]),
  ]);
  if (!meta) notFound();

  return (
    <DocumentWorkspace
      docId={meta.id}
      initialTitle={meta.title}
      initialRole={role}
      currentUserId={user.id}
      members={members}
      invites={invites.map((invite) => ({ ...invite, createdAt: invite.createdAt.toISOString() }))}
      syncUrl={process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:5201"}
    />
  );
}
