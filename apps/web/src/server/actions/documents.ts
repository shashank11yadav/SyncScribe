"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { documentMembers, documents, notifyAccessChanged } from "@syncscribe/db";
import {
  canRemoveMember,
  canTransferTo,
  createDocInput,
  docRefInput,
  memberRefInput,
  renameDocInput,
} from "@syncscribe/shared";
import { getRole, requireDocAccess } from "../access";
import { getDb } from "../db";
import { UserFacingError } from "../errors";
import { LIMITS, consume } from "../rate-limit";
import { runAction, type ActionResult } from "../result";
import { requireUser } from "../session";

export async function createDocument(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { title } = createDocInput.parse(input ?? {});
    const user = await requireUser();
    await consume(`create:${user.id}`, LIMITS.createDocument);

    const id = await getDb().transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({ title: title ?? "Untitled" })
        .returning({ id: documents.id });
      await tx.insert(documentMembers).values({ documentId: doc!.id, userId: user.id, role: "owner", addedBy: user.id });
      return doc!.id;
    });
    revalidatePath("/documents");
    return { id };
  });
}

export async function renameDocument(input: unknown): Promise<ActionResult<{ title: string }>> {
  return runAction(async () => {
    const { docId, title } = renameDocInput.parse(input);
    await requireDocAccess(docId, "doc.rename");
    await getDb().update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, docId));
    revalidatePath("/documents");
    return { title };
  });
}

export async function deleteDocument(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { docId } = docRefInput.parse(input);
    await requireDocAccess(docId, "doc.delete");
    const db = getDb();
    await db.delete(documents).where(eq(documents.id, docId));
    await notifyAccessChanged(db, docId);
    revalidatePath("/documents");
    return undefined;
  });
}

export async function transferOwnership(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { docId, userId } = memberRefInput.parse(input);
    const { user, role } = await requireDocAccess(docId, "doc.transfer");
    const targetRole = await getRole(docId, userId);
    if (!canTransferTo(role, targetRole)) {
      throw new UserFacingError("Ownership can only be transferred to an existing editor or viewer.");
    }
    const db = getDb();
    await db.transaction(async (tx) => {
      // Demote first: the one-owner unique index would reject the reverse order.
      await tx
        .update(documentMembers)
        .set({ role: "editor" })
        .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, user.id)));
      await tx
        .update(documentMembers)
        .set({ role: "owner" })
        .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, userId)));
    });
    await notifyAccessChanged(db, docId);
    revalidatePath(`/documents/${docId}`);
    return undefined;
  });
}

export async function leaveDocument(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { docId } = docRefInput.parse(input);
    const { user, role } = await requireDocAccess(docId, "doc.leave");
    if (!canRemoveMember({ id: user.id, role }, { id: user.id, role })) {
      throw new UserFacingError("Transfer ownership before leaving, or delete the document.");
    }
    const db = getDb();
    await db
      .delete(documentMembers)
      .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, user.id)));
    await notifyAccessChanged(db, docId);
    revalidatePath("/documents");
    return undefined;
  });
}
