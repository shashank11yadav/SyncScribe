import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { documentInvites, documentMembers, documentVersions, documents, users } from "@syncscribe/db";
import type { Role } from "@syncscribe/shared";
import { getDb } from "./db";

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  updatedAt: Date;
  ownerName: string | null;
}

/** Only documents the user is a member of. There is no "list all" query anywhere. */
export async function listDocumentsFor(userId: string): Promise<DocumentSummary[]> {
  const ownerMember = alias(documentMembers, "owner_member");
  const owner = alias(users, "owner");
  return getDb()
    .select({
      id: documents.id,
      title: documents.title,
      role: documentMembers.role,
      updatedAt: documents.updatedAt,
      ownerName: owner.name,
    })
    .from(documentMembers)
    .innerJoin(documents, eq(documents.id, documentMembers.documentId))
    .leftJoin(ownerMember, and(eq(ownerMember.documentId, documents.id), eq(ownerMember.role, "owner")))
    .leftJoin(owner, eq(owner.id, ownerMember.userId))
    .where(eq(documentMembers.userId, userId))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocumentMeta(docId: string) {
  const [doc] = await getDb()
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents)
    .where(eq(documents.id, docId))
    .limit(1);
  return doc ?? null;
}

export interface MemberView {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
}

export async function listMembers(docId: string): Promise<MemberView[]> {
  return getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: documentMembers.role,
    })
    .from(documentMembers)
    .innerJoin(users, eq(users.id, documentMembers.userId))
    .where(eq(documentMembers.documentId, docId))
    .orderBy(sql`case ${documentMembers.role} when 'owner' then 0 when 'editor' then 1 else 2 end`, asc(users.name));
}

export interface InviteView {
  id: string;
  email: string;
  role: "editor" | "viewer";
  createdAt: Date;
}

export async function listInvites(docId: string): Promise<InviteView[]> {
  return getDb()
    .select({ id: documentInvites.id, email: documentInvites.email, role: documentInvites.role, createdAt: documentInvites.createdAt })
    .from(documentInvites)
    .where(eq(documentInvites.documentId, docId))
    .orderBy(asc(documentInvites.createdAt));
}

export interface VersionView {
  id: string;
  kind: "auto" | "manual";
  createdAt: string;
  author: string | null;
}

export async function listVersions(docId: string, limit = 50): Promise<VersionView[]> {
  const rows = await getDb()
    .select({ id: documentVersions.id, kind: documentVersions.kind, createdAt: documentVersions.createdAt, author: users.name })
    .from(documentVersions)
    .leftJoin(users, eq(users.id, documentVersions.createdBy))
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getVersionState(docId: string, versionId: string): Promise<Uint8Array | null> {
  const [row] = await getDb()
    .select({ state: documentVersions.state })
    .from(documentVersions)
    // Scoped by document as well as id, so access to one document never
    // reaches another document's history.
    .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, docId)))
    .limit(1);
  return row?.state ?? null;
}

export async function getDocumentState(docId: string): Promise<Uint8Array | null> {
  const [row] = await getDb().select({ state: documents.state }).from(documents).where(eq(documents.id, docId)).limit(1);
  return row?.state ?? null;
}
