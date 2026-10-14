import { randomUUID } from "node:crypto";
import { documentMembers, documents, users, type Database } from "@syncscribe/db";
import type { Role } from "@syncscribe/shared";

export async function createUser(db: Database, overrides: Partial<{ name: string; email: string }> = {}) {
  const id = randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      id,
      name: overrides.name ?? `User ${id.slice(0, 6)}`,
      email: overrides.email ?? `${id}@test.syncscribe.dev`,
    })
    .returning();
  return user!;
}

/** A document with the given members. The first entry should be the owner. */
export async function createDocument(db: Database, members: Array<{ userId: string; role: Role }>, title = "Test doc") {
  const [doc] = await db.insert(documents).values({ title }).returning();
  if (members.length > 0) {
    await db.insert(documentMembers).values(members.map((m) => ({ documentId: doc!.id, userId: m.userId, role: m.role })));
  }
  return doc!;
}
