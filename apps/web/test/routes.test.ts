import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { beforeEach, describe, expect, it } from "vitest";
import { documentVersions, documents } from "@syncscribe/db";
import { SANDBOX_DOCUMENT, docDocumentName, verifySyncToken, writeSandboxSeed } from "@syncscribe/shared";
import { TEST_SYNC_SECRET } from "../../../test/env";
import { createDocument } from "../../../test/factories";
import { POST as tokenRoute } from "@/app/api/documents/[id]/token/route";
import { GET as exportRoute } from "@/app/api/documents/[id]/export/route";
import { GET as versionsRoute } from "@/app/api/documents/[id]/versions/route";
import { GET as versionRoute } from "@/app/api/documents/[id]/versions/[versionId]/route";
import { POST as sandboxRoute } from "@/app/api/sandbox/token/route";
import { db, fixture, request, routeContext, signInAs } from "./helpers";
import { requestHeaders } from "./state";

beforeEach(() => signInAs(null));

async function mintToken(docId: string, init: Parameters<typeof request>[1] = {}) {
  return tokenRoute(request(`/api/documents/${docId}/token`, { method: "POST", ...init }), routeContext({ id: docId }));
}

describe("POST /api/documents/:id/token", () => {
  it("issues a token carrying the database role", async () => {
    const { doc, viewer } = await fixture();
    signInAs(viewer);
    const res = await mintToken(doc.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { token: string; role: string };
    const claims = await verifySyncToken(body.token, TEST_SYNC_SECRET);
    expect(claims).toMatchObject({ sub: viewer.id, role: "viewer", kind: "user", doc: docDocumentName(doc.id) });
  });

  it("ignores a role asked for in the body", async () => {
    const { doc, viewer } = await fixture();
    signInAs(viewer);
    const res = await mintToken(doc.id, { body: JSON.stringify({ role: "owner", sub: "someone-else" }) });
    const claims = await verifySyncToken(((await res.json()) as { token: string }).token, TEST_SYNC_SECRET);
    expect(claims.role).toBe("viewer");
    expect(claims.sub).toBe(viewer.id);
  });

  it("returns 401 without a session and 404 to strangers", async () => {
    const { doc, stranger } = await fixture();
    expect((await mintToken(doc.id)).status).toBe(401);
    signInAs(stranger);
    expect((await mintToken(doc.id)).status).toBe(404);
  });

  it("refuses cross-site and origin-less requests", async () => {
    const { doc, owner } = await fixture();
    signInAs(owner);
    expect((await mintToken(doc.id, { origin: "https://evil.example" })).status).toBe(403);
    expect((await mintToken(doc.id, { origin: null })).status).toBe(403);
  });

  it("returns 404 for malformed ids", async () => {
    const { owner } = await fixture();
    signInAs(owner);
    expect((await mintToken("not-a-uuid")).status).toBe(404);
  });
});

describe("GET /api/documents/:id/export", () => {
  it("lets viewers download Markdown of the stored state", async () => {
    const { doc, viewer } = await fixture();
    const ydoc = new Y.Doc();
    writeSandboxSeed(ydoc);
    await db.update(documents).set({ state: Y.encodeStateAsUpdate(ydoc), title: "Notes / Q3" }).where(eq(documents.id, doc.id));

    signInAs(viewer);
    const res = await exportRoute(request(`/api/documents/${doc.id}/export`), routeContext({ id: doc.id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Notes-Q3.md"');
    const text = await res.text();
    expect(text).toMatch(/^# Notes \/ Q3\n\n# Welcome to the SyncScribe sandbox\n/);
    expect(text).toContain("- Open this page in a second window");
  });

  it("returns 404 to strangers", async () => {
    const { doc, stranger } = await fixture();
    signInAs(stranger);
    const res = await exportRoute(request(`/api/documents/${doc.id}/export`), routeContext({ id: doc.id }));
    expect(res.status).toBe(404);
  });
});

describe("version history routes", () => {
  async function seedVersion(docId: string) {
    const ydoc = new Y.Doc();
    writeSandboxSeed(ydoc);
    const [row] = await db
      .insert(documentVersions)
      .values({ documentId: docId, state: Y.encodeStateAsUpdate(ydoc), kind: "auto" })
      .returning();
    return row!;
  }

  it("lists and previews versions for editors", async () => {
    const { doc, editor } = await fixture();
    const version = await seedVersion(doc.id);
    signInAs(editor);
    const list = await versionsRoute(request(`/api/documents/${doc.id}/versions`), routeContext({ id: doc.id }));
    expect(((await list.json()) as { versions: Array<{ id: string }> }).versions.map((v) => v.id)).toEqual([version.id]);
    const one = await versionRoute(
      request(`/api/documents/${doc.id}/versions/${version.id}`),
      routeContext({ id: doc.id, versionId: version.id }),
    );
    const body = (await one.json()) as { content: { type: string; content: Array<{ type: string }> } };
    expect(body.content.type).toBe("doc");
    expect(body.content.content[0]?.type).toBe("heading");
  });

  it("is closed to viewers", async () => {
    const { doc, viewer } = await fixture();
    const version = await seedVersion(doc.id);
    signInAs(viewer);
    expect((await versionsRoute(request(`/api/documents/${doc.id}/versions`), routeContext({ id: doc.id }))).status).toBe(403);
    const one = await versionRoute(
      request(`/api/documents/${doc.id}/versions/${version.id}`),
      routeContext({ id: doc.id, versionId: version.id }),
    );
    expect(one.status).toBe(403);
  });

  it("does not leak another document's version through a document you can access", async () => {
    const { doc, owner } = await fixture();
    const secret = await createDocument(db, []);
    const foreign = await seedVersion(secret.id);
    signInAs(owner);
    const res = await versionRoute(
      request(`/api/documents/${doc.id}/versions/${foreign.id}`),
      routeContext({ id: doc.id, versionId: foreign.id }),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/sandbox/token", () => {
  it("issues guest tokens that only open the sandbox", async () => {
    requestHeaders.current = new Headers({ "x-real-ip": `10.0.0.${Math.floor(Math.random() * 250)}` });
    const res = await sandboxRoute(request("/api/sandbox/token", { method: "POST" }));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const claims = await verifySyncToken(token, TEST_SYNC_SECRET);
    expect(claims).toMatchObject({ kind: "guest", doc: SANDBOX_DOCUMENT, role: "editor" });
    expect(claims.sub).toMatch(/^guest:/);
  });

  it("refuses cross-site requests", async () => {
    const res = await sandboxRoute(request("/api/sandbox/token", { method: "POST", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("rate limits by client address", async () => {
    requestHeaders.current = new Headers({ "x-real-ip": `192.0.2.${Math.floor(Math.random() * 250)}-${Date.now()}` });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await sandboxRoute(request("/api/sandbox/token", { method: "POST" }))).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
