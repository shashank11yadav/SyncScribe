import "server-only";
import { eq } from "drizzle-orm";
import { documentInvites, documentMembers, users } from "@syncscribe/db";
import { getDb } from "./db";

/**
 * Turns pending invites for the user's verified email into memberships.
 * Runs on page loads rather than at share time, so sharing behaves the same
 * whether or not the address belongs to an account. That is what keeps the
 * share dialog from revealing who has signed up.
 */
export async function claimInvites(userId: string): Promise<number> {
  const db = getDb();
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email) return 0;
  const email = user.email.toLowerCase();

  return db.transaction(async (tx) => {
    const pending = await tx.delete(documentInvites).where(eq(documentInvites.email, email)).returning();
    if (pending.length === 0) return 0;
    await tx
      .insert(documentMembers)
      .values(pending.map((invite) => ({ documentId: invite.documentId, userId, role: invite.role, addedBy: invite.invitedBy })))
      .onConflictDoNothing();
    return pending.length;
  });
}
