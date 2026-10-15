"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { documentInvites, documentMembers, notifyAccessChanged, users } from "@syncscribe/db";
import {
  canChangeRole,
  canGrant,
  canRemoveMember,
  changeRoleInput,
  inviteRefInput,
  memberRefInput,
  shareDocInput,
} from "@syncscribe/shared";
import { getRole, requireDocAccess } from "../access";
import { getDb } from "../db";
import { AccessError, UserFacingError } from "../errors";
import { LIMITS, consume } from "../rate-limit";
import { SHARE_CONFIRMATION } from "../messages";
import { runAction, type ActionResult } from "../result";

/**
 * Sharing always records an invite, whether or not the address has an
 * account, and always returns the same message. The recipient claims it the
 * next time they load the app.
 */
export async function shareDocument(input: unknown): Promise<ActionResult<{ message: string }>> {
  return runAction(async () => {
    const { docId, email, role } = shareDocInput.parse(input);
    const access = await requireDocAccess(docId, "doc.share");
    if (!canGrant(access.role, role)) throw new AccessError("forbidden");
    await consume(`share:${access.user.id}`, LIMITS.share);

    const db = getDb();
    const existingMember = await db
      .select({ userId: documentMembers.userId })
      .from(documentMembers)
      .innerJoin(users, eq(users.id, documentMembers.userId))
      .where(and(eq(documentMembers.documentId, docId), eq(users.email, email)))
      .limit(1);

    // Existing members keep their role; changing it is a separate, owner-only action.
    if (existingMember.length === 0) {
      await db
        .insert(documentInvites)
        .values({ documentId: docId, email, role, invitedBy: access.user.id })
        .onConflictDoNothing({ target: [documentInvites.documentId, documentInvites.email] });
    }

    revalidatePath(`/documents/${docId}`);
    return { message: SHARE_CONFIRMATION };
  });
}

export async function changeMemberRole(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { docId, userId, role } = changeRoleInput.parse(input);
    const access = await requireDocAccess(docId, "doc.changeRole");
    const current = await getRole(docId, userId);
    if (!current) throw new UserFacingError("That person is not a member of this document.");
    if (!canChangeRole(access.role, current, role)) {
      throw new UserFacingError("The owner's role can only change through a transfer.");
    }
    const db = getDb();
    await db
      .update(documentMembers)
      .set({ role })
      .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, userId)));
    await notifyAccessChanged(db, docId);
    revalidatePath(`/documents/${docId}`);
    return undefined;
  });
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { docId, userId } = memberRefInput.parse(input);
    // Any member may call this, but only for themselves unless they own the doc.
    const access = await requireDocAccess(docId, "doc.leave");
    const targetRole = await getRole(docId, userId);
    if (!targetRole) throw new UserFacingError("That person is not a member of this document.");
    if (!canRemoveMember({ id: access.user.id, role: access.role }, { id: userId, role: targetRole })) {
      throw new AccessError("forbidden");
    }
    const db = getDb();
    await db
      .delete(documentMembers)
      .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, userId)));
    await notifyAccessChanged(db, docId);
    revalidatePath(`/documents/${docId}`);
    return undefined;
  });
}

export async function revokeInvite(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { docId, inviteId } = inviteRefInput.parse(input);
    await requireDocAccess(docId, "doc.revokeInvite");
    await getDb()
      .delete(documentInvites)
      .where(and(eq(documentInvites.id, inviteId), eq(documentInvites.documentId, docId)));
    revalidatePath(`/documents/${docId}`);
    return undefined;
  });
}
