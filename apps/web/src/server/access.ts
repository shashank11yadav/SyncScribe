import "server-only";
import { and, eq } from "drizzle-orm";
import { documentMembers } from "@syncscribe/db";
import { ACTIONS, docIdSchema, roleAtLeast, type Action, type Role } from "@syncscribe/shared";
import { getDb } from "./db";
import { AccessError } from "./errors";
import { requireUser, type SessionUser } from "./session";

export async function getRole(docId: string, userId: string): Promise<Role | null> {
  const [row] = await getDb()
    .select({ role: documentMembers.role })
    .from(documentMembers)
    .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export interface DocAccess {
  user: SessionUser;
  role: Role;
  docId: string;
}

/**
 * Every server action and route handler that touches a document goes through
 * here. The required role comes from the shared ACTIONS table; the caller's
 * role is read from the database for the session user. Nothing in the request
 * can raise it.
 */
export async function requireDocAccess(docId: string, action: Action): Promise<DocAccess> {
  const parsedId = docIdSchema.safeParse(docId);
  if (!parsedId.success) throw new AccessError("not_found");

  const user = await requireUser();
  const role = await getRole(parsedId.data, user.id);
  if (!role) throw new AccessError("not_found");
  if (!roleAtLeast(role, ACTIONS[action])) throw new AccessError("forbidden");
  return { user, role, docId: parsedId.data };
}
