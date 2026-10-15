import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { documentInvites, documentMembers, documentVersions, documents } from "@syncscribe/db";
import { createDocument, createUser } from "../../../test/factories";
import {
  createDocument as createDocumentAction,
  deleteDocument,
  leaveDocument,
  renameDocument,
  transferOwnership,
} from "@/server/actions/documents";
import { changeMemberRole, removeMember, revokeInvite, shareDocument } from "@/server/actions/sharing";
import { createSnapshot } from "@/server/actions/versions";
import { requireDocAccess } from "@/server/access";
import { AccessError } from "@/server/errors";
import { claimInvites } from "@/server/invites";
import { SHARE_CONFIRMATION } from "@/server/messages";
import { db, fixture, signInAs } from "./helpers";

const NOT_FOUND = "That document does not exist or you no longer have access.";
const FORBIDDEN = "Your role on this document does not allow that.";
const SIGN_IN = "Please sign in again.";

async function roleOf(docId: string, userId: string) {
  const [row] = await db
    .select({ role: documentMembers.role })
    .from(documentMembers)
    .where(and(eq(documentMembers.documentId, docId), eq(documentMembers.userId, userId)));
  return row?.role ?? null;
}

async function titleOf(docId: string) {
  const [row] = await db.select({ title: documents.title }).from(documents).where(eq(documents.id, docId));
  return row?.title ?? null;
}

beforeEach(() => signInAs(null));

describe("requireDocAccess", () => {
  it("rejects anonymous callers", async () => {
    const { doc } = await fixture();
    await expect(requireDocAccess(doc.id, "doc.read")).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("reports not_found to strangers so ids cannot be probed", async () => {
    const { doc, stranger } = await fixture();
    signInAs(stranger);
    await expect(requireDocAccess(doc.id, "doc.read")).rejects.toMatchObject({ code: "not_found" });
  });

  it("reports forbidden to members below the required role", async () => {
    const { doc, viewer } = await fixture();
    signInAs(viewer);
    await expect(requireDocAccess(doc.id, "doc.edit")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("treats malformed ids as not found without querying", async () => {
    const { viewer } = await fixture();
    signInAs(viewer);
    await expect(requireDocAccess("1 or 1=1", "doc.read")).rejects.toBeInstanceOf(AccessError);
  });

  it("reads the role from the database, not from the session", async () => {
    const { doc, viewer } = await fixture();
    // A session object that claims more than the database grants changes nothing.
    signInAs({ ...viewer, role: "owner" } as never);
    await expect(requireDocAccess(doc.id, "doc.delete")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("createDocument", () => {
  it("requires a session", async () => {
    expect(await createDocumentAction({})).toEqual({ ok: false, error: SIGN_IN });
  });

  it("makes the caller the owner", async () => {
    const user = await createUser(db);
    signInAs(user);
    const result = await createDocumentAction({ title: "Plan" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await roleOf(result.data.id, user.id)).toBe("owner");
  });

  it("rejects a forged owner id in the input", async () => {
    const user = await createUser(db);
    const victim = await createUser(db);
    signInAs(user);
    const result = await createDocumentAction({ title: "x", ownerId: victim.id });
    expect(result.ok).toBe(false);
  });
});

describe("renameDocument", () => {
  it("allows owners and editors", async () => {
    const { doc, owner, editor } = await fixture();
    signInAs(owner);
    expect((await renameDocument({ docId: doc.id, title: "By owner" })).ok).toBe(true);
    signInAs(editor);
    expect((await renameDocument({ docId: doc.id, title: "By editor" })).ok).toBe(true);
    expect(await titleOf(doc.id)).toBe("By editor");
  });

  it("refuses viewers and strangers and leaves the title alone", async () => {
    const { doc, viewer, stranger } = await fixture();
    signInAs(viewer);
    expect(await renameDocument({ docId: doc.id, title: "Hacked" })).toEqual({ ok: false, error: FORBIDDEN });
    signInAs(stranger);
    expect(await renameDocument({ docId: doc.id, title: "Hacked" })).toEqual({ ok: false, error: NOT_FOUND });
    expect(await titleOf(doc.id)).toBe("Fixture doc");
  });

  it("ignores a role claimed in the request", async () => {
    const { doc, viewer } = await fixture();
    signInAs(viewer);
    const result = await renameDocument({ docId: doc.id, title: "Hacked", role: "owner" });
    expect(result.ok).toBe(false);
    expect(await titleOf(doc.id)).toBe("Fixture doc");
  });

  it("validates the title", async () => {
    const { doc, owner } = await fixture();
    signInAs(owner);
    expect((await renameDocument({ docId: doc.id, title: "   " })).ok).toBe(false);
    expect((await renameDocument({ docId: doc.id, title: "x".repeat(200) })).ok).toBe(false);
  });
});

describe("deleteDocument", () => {
  it("is owner only", async () => {
    const { doc, editor, viewer, stranger } = await fixture();
    for (const user of [editor, viewer]) {
      signInAs(user);
      expect(await deleteDocument({ docId: doc.id })).toEqual({ ok: false, error: FORBIDDEN });
    }
    signInAs(stranger);
    expect(await deleteDocument({ docId: doc.id })).toEqual({ ok: false, error: NOT_FOUND });
    expect(await titleOf(doc.id)).toBe("Fixture doc");
  });

  it("removes the document and its memberships", async () => {
    const { doc, owner, editor } = await fixture();
    signInAs(owner);
    expect((await deleteDocument({ docId: doc.id })).ok).toBe(true);
    expect(await titleOf(doc.id)).toBeNull();
    expect(await roleOf(doc.id, editor.id)).toBeNull();
  });
});

describe("shareDocument", () => {
  it("lets editors invite as viewer or editor", async () => {
    const { doc, editor } = await fixture();
    signInAs(editor);
    const result = await shareDocument({ docId: doc.id, email: "New.Person@Example.com", role: "viewer" });
    expect(result).toEqual({ ok: true, data: { message: SHARE_CONFIRMATION } });
    const invites = await db.select().from(documentInvites).where(eq(documentInvites.documentId, doc.id));
    expect(invites).toEqual([expect.objectContaining({ email: "new.person@example.com", role: "viewer" })]);
  });

  it("refuses viewers and strangers", async () => {
    const { doc, viewer, stranger } = await fixture();
    signInAs(viewer);
    expect(await shareDocument({ docId: doc.id, email: "a@example.com", role: "viewer" })).toEqual({ ok: false, error: FORBIDDEN });
    signInAs(stranger);
    expect(await shareDocument({ docId: doc.id, email: "a@example.com", role: "viewer" })).toEqual({ ok: false, error: NOT_FOUND });
    const invites = await db.select().from(documentInvites).where(eq(documentInvites.documentId, doc.id));
    expect(invites).toHaveLength(0);
  });

  it("never grants owner", async () => {
    const { doc, owner } = await fixture();
    signInAs(owner);
    expect((await shareDocument({ docId: doc.id, email: "a@example.com", role: "owner" })).ok).toBe(false);
  });

  it("answers identically for registered and unregistered addresses", async () => {
    const { doc, owner } = await fixture();
    const registered = await createUser(db, { email: `known-${doc.id}@example.com` });
    signInAs(owner);
    const a = await shareDocument({ docId: doc.id, email: registered.email!, role: "editor" });
    const b = await shareDocument({ docId: doc.id, email: `nobody-${doc.id}@example.com`, role: "editor" });
    expect(a).toEqual(b);
    // Neither address gets access until its owner signs in, so the member list reveals nothing either.
    expect(await roleOf(doc.id, registered.id)).toBeNull();
  });

  it("does not change the role of an existing member", async () => {
    const { doc, editor, viewer } = await fixture();
    signInAs(editor);
    await shareDocument({ docId: doc.id, email: viewer.email!, role: "editor" });
    expect(await roleOf(doc.id, viewer.id)).toBe("viewer");
  });

  it("is rate limited per user", async () => {
    const { doc, owner } = await fixture();
    signInAs(owner);
    const results = [];
    for (let i = 0; i < 21; i++) {
      results.push(await shareDocument({ docId: doc.id, email: `bulk${i}-${doc.id}@example.com`, role: "viewer" }));
    }
    expect(results.slice(0, 20).every((r) => r.ok)).toBe(true);
    expect(results[20]).toMatchObject({ ok: false, error: expect.stringContaining("Too many requests") });
  });
});

describe("pending invites", () => {
  it("are claimed by the matching verified email", async () => {
    const { doc, owner } = await fixture();
    const email = `later-${doc.id}@example.com`;
    signInAs(owner);
    await shareDocument({ docId: doc.id, email, role: "editor" });

    const newcomer = await createUser(db, { email });
    expect(await claimInvites(newcomer.id)).toBe(1);
    expect(await roleOf(doc.id, newcomer.id)).toBe("editor");
    const left = await db.select().from(documentInvites).where(eq(documentInvites.documentId, doc.id));
    expect(left).toHaveLength(0);
  });

  it("are not claimed by an account without a verified email", async () => {
    const { doc, owner } = await fixture();
    signInAs(owner);
    await shareDocument({ docId: doc.id, email: `x-${doc.id}@example.com`, role: "editor" });
    const [user] = await db.insert((await import("@syncscribe/db")).users).values({ name: "No email" }).returning();
    expect(await claimInvites(user!.id)).toBe(0);
  });

  it("can only be revoked by the owner, and only within the same document", async () => {
    const { doc, owner, editor } = await fixture();
    const other = await createDocument(db, [{ userId: editor.id, role: "owner" }]);
    signInAs(owner);
    await shareDocument({ docId: doc.id, email: `rev-${doc.id}@example.com`, role: "viewer" });
    const [invite] = await db.select().from(documentInvites).where(eq(documentInvites.documentId, doc.id));

    signInAs(editor);
    expect(await revokeInvite({ docId: doc.id, inviteId: invite!.id })).toEqual({ ok: false, error: FORBIDDEN });
    // Owner of a different document cannot reach this invite through their own document id.
    expect((await revokeInvite({ docId: other.id, inviteId: invite!.id })).ok).toBe(true);
    expect(await db.select().from(documentInvites).where(eq(documentInvites.id, invite!.id))).toHaveLength(1);

    signInAs(owner);
    expect((await revokeInvite({ docId: doc.id, inviteId: invite!.id })).ok).toBe(true);
    expect(await db.select().from(documentInvites).where(eq(documentInvites.id, invite!.id))).toHaveLength(0);
  });
});

describe("changeMemberRole", () => {
  it("lets the owner promote and demote", async () => {
    const { doc, owner, viewer } = await fixture();
    signInAs(owner);
    expect((await changeMemberRole({ docId: doc.id, userId: viewer.id, role: "editor" })).ok).toBe(true);
    expect(await roleOf(doc.id, viewer.id)).toBe("editor");
  });

  it("refuses editors, even for viewers", async () => {
    const { doc, editor, viewer } = await fixture();
    signInAs(editor);
    expect(await changeMemberRole({ docId: doc.id, userId: viewer.id, role: "editor" })).toEqual({ ok: false, error: FORBIDDEN });
    expect(await roleOf(doc.id, viewer.id)).toBe("viewer");
  });

  it("does not let a viewer promote themselves", async () => {
    const { doc, viewer } = await fixture();
    signInAs(viewer);
    expect((await changeMemberRole({ docId: doc.id, userId: viewer.id, role: "editor" })).ok).toBe(false);
    expect(await roleOf(doc.id, viewer.id)).toBe("viewer");
  });

  it("cannot demote the owner or create a second one", async () => {
    const { doc, owner, editor } = await fixture();
    signInAs(owner);
    expect((await changeMemberRole({ docId: doc.id, userId: owner.id, role: "viewer" })).ok).toBe(false);
    expect((await changeMemberRole({ docId: doc.id, userId: editor.id, role: "owner" })).ok).toBe(false);
    expect(await roleOf(doc.id, owner.id)).toBe("owner");
    expect(await roleOf(doc.id, editor.id)).toBe("editor");
  });
});

describe("removeMember and leaveDocument", () => {
  it("lets the owner remove others", async () => {
    const { doc, owner, editor } = await fixture();
    signInAs(owner);
    expect((await removeMember({ docId: doc.id, userId: editor.id })).ok).toBe(true);
    expect(await roleOf(doc.id, editor.id)).toBeNull();
  });

  it("stops editors removing other members", async () => {
    const { doc, editor, viewer } = await fixture();
    signInAs(editor);
    expect(await removeMember({ docId: doc.id, userId: viewer.id })).toEqual({ ok: false, error: FORBIDDEN });
    expect(await roleOf(doc.id, viewer.id)).toBe("viewer");
  });

  it("lets a viewer leave", async () => {
    const { doc, viewer } = await fixture();
    signInAs(viewer);
    expect((await leaveDocument({ docId: doc.id })).ok).toBe(true);
    expect(await roleOf(doc.id, viewer.id)).toBeNull();
  });

  it("does not let the owner leave or remove themselves", async () => {
    const { doc, owner } = await fixture();
    signInAs(owner);
    expect((await leaveDocument({ docId: doc.id })).ok).toBe(false);
    expect((await removeMember({ docId: doc.id, userId: owner.id })).ok).toBe(false);
    expect(await roleOf(doc.id, owner.id)).toBe("owner");
  });

  it("does not let a stranger remove anyone", async () => {
    const { doc, stranger, viewer } = await fixture();
    signInAs(stranger);
    expect(await removeMember({ docId: doc.id, userId: viewer.id })).toEqual({ ok: false, error: NOT_FOUND });
  });
});

describe("transferOwnership", () => {
  it("swaps roles atomically", async () => {
    const { doc, owner, editor } = await fixture();
    signInAs(owner);
    expect((await transferOwnership({ docId: doc.id, userId: editor.id })).ok).toBe(true);
    expect(await roleOf(doc.id, editor.id)).toBe("owner");
    expect(await roleOf(doc.id, owner.id)).toBe("editor");
  });

  it("is owner only", async () => {
    const { doc, editor, viewer } = await fixture();
    signInAs(editor);
    expect(await transferOwnership({ docId: doc.id, userId: viewer.id })).toEqual({ ok: false, error: FORBIDDEN });
    expect(await transferOwnership({ docId: doc.id, userId: editor.id })).toEqual({ ok: false, error: FORBIDDEN });
  });

  it("only goes to existing members", async () => {
    const { doc, owner, stranger } = await fixture();
    signInAs(owner);
    expect((await transferOwnership({ docId: doc.id, userId: stranger.id })).ok).toBe(false);
    expect(await roleOf(doc.id, stranger.id)).toBeNull();
    expect(await roleOf(doc.id, owner.id)).toBe("owner");
  });
});

describe("createSnapshot", () => {
  it("lets editors save a version and refuses viewers", async () => {
    const { doc, editor, viewer } = await fixture();
    await db.update(documents).set({ state: new Uint8Array([0, 0]) }).where(eq(documents.id, doc.id));
    signInAs(viewer);
    expect(await createSnapshot({ docId: doc.id })).toEqual({ ok: false, error: FORBIDDEN });
    signInAs(editor);
    expect((await createSnapshot({ docId: doc.id })).ok).toBe(true);
    const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id));
    expect(versions).toEqual([expect.objectContaining({ kind: "manual", createdBy: editor.id })]);
  });
});

describe("database guarantees", () => {
  it("allows only one owner per document", async () => {
    const { doc, editor } = await fixture();
    await expect(
      db.update(documentMembers).set({ role: "owner" }).where(and(eq(documentMembers.documentId, doc.id), eq(documentMembers.userId, editor.id))),
    ).rejects.toThrow();
  });
});
