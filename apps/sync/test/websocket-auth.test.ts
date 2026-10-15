import { eq, and } from "drizzle-orm";
import { SignJWT } from "jose";
import WebSocket from "ws";
import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { documentMembers, documents, notifyAccessChanged } from "@syncscribe/db";
import {
  SANDBOX_DOCUMENT,
  SYNC_TOKEN_AUDIENCE,
  SYNC_TOKEN_ISSUER,
  docDocumentName,
  signSyncToken,
} from "@syncscribe/shared";
import { TEST_SYNC_SECRET } from "../../../test/env";
import { createDocument, createUser } from "../../../test/factories";
import { connect, sleep, startServer, textOf, tokenFor, waitFor, writeParagraph, type ConnectResult } from "./helpers";

let ctx: Awaited<ReturnType<typeof startServer>>;
const open: ConnectResult[] = [];

async function track(result: Promise<ConnectResult>) {
  const r = await result;
  open.push(r);
  return r;
}

beforeAll(async () => {
  ctx = await startServer();
});

afterEach(() => {
  for (const r of open.splice(0)) r.provider.destroy();
});

afterAll(async () => {
  await ctx.stop();
});

async function storedText(docId: string): Promise<string> {
  const [row] = await ctx.database.db.select({ state: documents.state }).from(documents).where(eq(documents.id, docId));
  const stored = new Y.Doc();
  if (row?.state) Y.applyUpdate(stored, row.state);
  return textOf(stored);
}

async function setup() {
  const db = ctx.database.db;
  const owner = await createUser(db);
  const editor = await createUser(db);
  const viewer = await createUser(db);
  const stranger = await createUser(db);
  const doc = await createDocument(db, [
    { userId: owner.id, role: "owner" },
    { userId: editor.id, role: "editor" },
    { userId: viewer.id, role: "viewer" },
  ]);
  return { owner, editor, viewer, stranger, doc, name: docDocumentName(doc.id) };
}

describe("token checks", () => {
  it("rejects a garbage token", async () => {
    const { name } = await setup();
    const r = await track(connect(ctx.url, name, "not-a-token"));
    expect(r).toMatchObject({ status: "denied", reason: "invalid-token" });
  });

  it("rejects an expired token", async () => {
    const { name, editor } = await setup();
    const token = await tokenFor({ sub: editor.id, doc: name, role: "editor" }, { now: new Date(Date.now() - 3_600_000) });
    const r = await track(connect(ctx.url, name, token));
    expect(r).toMatchObject({ status: "denied", reason: "token-expired" });
  });

  it("rejects a token signed with a different secret", async () => {
    const { name, editor } = await setup();
    const token = await signSyncToken(
      { sub: editor.id, doc: name, role: "editor", kind: "user", name: "x", color: "#026aa2" },
      "some-other-secret-that-is-long-enough-xxxxxxxx",
    );
    const r = await track(connect(ctx.url, name, token));
    expect(r).toMatchObject({ status: "denied", reason: "invalid-token" });
  });

  it("rejects a valid token presented for another document", async () => {
    const a = await setup();
    const b = await setup();
    const token = await tokenFor({ sub: a.editor.id, doc: a.name, role: "editor" });
    const r = await track(connect(ctx.url, b.name, token));
    expect(r).toMatchObject({ status: "denied", reason: "invalid-token" });
  });

  it("rejects a correctly signed token for someone with no membership", async () => {
    const { name, stranger } = await setup();
    const token = await tokenFor({ sub: stranger.id, doc: name, role: "editor" });
    const r = await track(connect(ctx.url, name, token));
    expect(r).toMatchObject({ status: "denied", reason: "forbidden" });
  });

  it("rejects a guest token aimed at a private document", async () => {
    const { name } = await setup();
    // signSyncToken refuses to build this, so forge it by hand with the real secret.
    const token = await new SignJWT({ kind: "guest", doc: name, role: "editor", name: "Guest", color: "#026aa2" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(SYNC_TOKEN_ISSUER)
      .setAudience(SYNC_TOKEN_AUDIENCE)
      .setSubject("guest:abc")
      .setIssuedAt()
      .setExpirationTime("1m")
      .sign(new TextEncoder().encode(TEST_SYNC_SECRET));
    const r = await track(connect(ctx.url, name, token));
    expect(r).toMatchObject({ status: "denied", reason: "invalid-token" });
  });

  it("rejects unknown document names", async () => {
    const r = await track(connect(ctx.url, "admin", "x"));
    expect(r.status).toBe("denied");
  });
});

describe("roles over the websocket", () => {
  it("gives editors a read-write connection", async () => {
    const { name, editor } = await setup();
    const r = await track(connect(ctx.url, name, await tokenFor({ sub: editor.id, doc: name, role: "editor" })));
    expect(r).toMatchObject({ status: "authenticated", scope: "read-write" });
  });

  it("gives viewers a read-only connection", async () => {
    const { name, viewer } = await setup();
    const r = await track(connect(ctx.url, name, await tokenFor({ sub: viewer.id, doc: name, role: "viewer" })));
    expect(r).toMatchObject({ status: "authenticated", scope: "readonly" });
  });

  it("uses the database role when the token claims more", async () => {
    const { name, viewer } = await setup();
    const r = await track(connect(ctx.url, name, await tokenFor({ sub: viewer.id, doc: name, role: "owner" })));
    expect(r).toMatchObject({ status: "authenticated", scope: "readonly" });
  });

  it("broadcasts and persists editor changes", async () => {
    const { name, editor, owner, doc } = await setup();
    const a = await track(connect(ctx.url, name, await tokenFor({ sub: editor.id, doc: name, role: "editor" })));
    const b = await track(connect(ctx.url, name, await tokenFor({ sub: owner.id, doc: name, role: "owner" })));
    writeParagraph(a.doc, "hello from the editor");
    await waitFor(() => textOf(b.doc).includes("hello from the editor"));

    ctx.server.hocuspocus.flushPendingStores();
    let stored = "";
    await waitFor(() => stored.includes("hello from the editor")).catch(() => {});
    for (let i = 0; i < 40 && !stored.includes("hello from the editor"); i++) {
      stored = await storedText(doc.id);
      await sleep(100);
    }
    expect(stored).toContain("hello from the editor");
  });

  it("drops writes from a viewer", async () => {
    const { name, editor, viewer, doc } = await setup();
    const e = await track(connect(ctx.url, name, await tokenFor({ sub: editor.id, doc: name, role: "editor" })));
    const v = await track(connect(ctx.url, name, await tokenFor({ sub: viewer.id, doc: name, role: "viewer" })));

    writeParagraph(v.doc, "viewer graffiti");
    writeParagraph(e.doc, "editor text");
    await waitFor(() => textOf(v.doc).includes("editor text"));
    await sleep(300);
    expect(textOf(e.doc)).not.toContain("viewer graffiti");

    const serverDoc = ctx.server.hocuspocus.documents.get(name);
    expect(serverDoc && textOf(serverDoc)).not.toContain("viewer graffiti");

    ctx.server.hocuspocus.flushPendingStores();
    await sleep(300);
    expect(await storedText(doc.id)).toContain("editor text");
    expect(await storedText(doc.id)).not.toContain("viewer graffiti");
  });
});

describe("revocation", () => {
  it("disconnects a removed member and refuses the reconnect", async () => {
    const { name, editor, doc } = await setup();
    const token = await tokenFor({ sub: editor.id, doc: name, role: "editor" });
    const r = await track(connect(ctx.url, name, token));
    expect(r.status).toBe("authenticated");

    const denied = new Promise<string>((resolve) => {
      r.provider.on("authenticationFailed", ({ reason }: { reason: string }) => resolve(reason));
    });

    await ctx.database.db
      .delete(documentMembers)
      .where(and(eq(documentMembers.documentId, doc.id), eq(documentMembers.userId, editor.id)));
    await notifyAccessChanged(ctx.database.db, doc.id);

    // The provider reconnects on its own with the same (still unexpired) token.
    await expect(denied).resolves.toBe("forbidden");
  });
});

describe("revocation, continued", () => {
  it("reconnects a downgraded editor as read-only", async () => {
    const { name, editor, doc } = await setup();
    // The client asks for a new token on every connect, like the web app does.
    const tokens = () => tokenFor({ sub: editor.id, doc: name, role: "editor" });
    const r = await track(connect(ctx.url, name, tokens));
    expect(r).toMatchObject({ status: "authenticated", scope: "read-write" });

    const downgraded = new Promise<string>((resolve) => {
      r.provider.on("authenticated", ({ scope }: { scope: string }) => resolve(scope));
    });
    await ctx.database.db
      .update(documentMembers)
      .set({ role: "viewer" })
      .where(and(eq(documentMembers.documentId, doc.id), eq(documentMembers.userId, editor.id)));
    await notifyAccessChanged(ctx.database.db, doc.id);
    await expect(downgraded).resolves.toBe("readonly");
  });

  it("refuses to reopen a deleted document", async () => {
    const { name, owner, doc } = await setup();
    const r = await track(connect(ctx.url, name, await tokenFor({ sub: owner.id, doc: name, role: "owner" })));
    const denied = new Promise<string>((resolve) => {
      r.provider.on("authenticationFailed", ({ reason }: { reason: string }) => resolve(reason));
    });
    await ctx.database.db.delete(documents).where(eq(documents.id, doc.id));
    await notifyAccessChanged(ctx.database.db, doc.id);
    await expect(denied).resolves.toBe("forbidden");
    ctx.server.hocuspocus.flushPendingStores();
    await sleep(200);
    const rows = await ctx.database.db.select().from(documents).where(eq(documents.id, doc.id));
    expect(rows).toHaveLength(0);
  });
});

describe("presence", () => {
  it("stamps awareness with the identity from the token", async () => {
    const { name, editor, owner } = await setup();
    const a = await track(connect(ctx.url, name, await tokenFor({ sub: editor.id, doc: name, role: "editor", name: "Real Name" })));
    const b = await track(connect(ctx.url, name, await tokenFor({ sub: owner.id, doc: name, role: "owner" })));
    a.provider.setAwarenessField("user", { name: "The Owner", color: "#000000" });
    const clientId = a.doc.clientID;
    await waitFor(() => b.provider.awareness?.getStates().get(clientId)?.user !== undefined);
    expect(b.provider.awareness?.getStates().get(clientId)?.user).toEqual({ name: "Real Name", color: expect.stringMatching(/^#/) });
    expect(b.provider.awareness?.getStates().get(clientId)?.user.name).not.toBe("The Owner");
  });
});

describe("sandbox", () => {
  it("lets a guest in with read-write access and serves the seed text", async () => {
    const token = await signSyncToken(
      { sub: "guest:test", kind: "guest", doc: SANDBOX_DOCUMENT, role: "editor", name: "Guest Otter", color: "#026aa2" },
      TEST_SYNC_SECRET,
    );
    const r = await track(connect(ctx.url, SANDBOX_DOCUMENT, token));
    expect(r).toMatchObject({ status: "authenticated", scope: "read-write" });
    await waitFor(() => textOf(r.doc).includes("Welcome to the SyncScribe sandbox"));
  });

  it("resets for clients that are still connected", async () => {
    const token = await signSyncToken(
      { sub: "guest:reset", kind: "guest", doc: SANDBOX_DOCUMENT, role: "editor", name: "Guest Wren", color: "#026aa2" },
      TEST_SYNC_SECRET,
    );
    const r = await track(connect(ctx.url, SANDBOX_DOCUMENT, token));
    writeParagraph(r.doc, "temporary scribble");
    await waitFor(() => textOf(ctx.server.hocuspocus.documents.get(SANDBOX_DOCUMENT)!).includes("temporary scribble"));
    await ctx.resetSandbox();
    await waitFor(() => !textOf(r.doc).includes("temporary scribble"));
    expect(textOf(r.doc)).toContain("Welcome to the SyncScribe sandbox");
  });
});

describe("transport checks", () => {
  function upgrade(origin: string): Promise<number> {
    return new Promise((resolve) => {
      const socket = new WebSocket(ctx.url, { origin });
      socket.on("open", () => {
        socket.close();
        resolve(101);
      });
      socket.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      socket.on("error", () => resolve(-1));
    });
  }

  it("refuses websocket upgrades from unknown origins", async () => {
    expect(await upgrade("https://evil.example")).toBe(403);
  });

  it("accepts the configured web origin", async () => {
    expect(await upgrade("http://localhost:5200")).toBe(101);
  });

  it("refuses upgrades past the per-address limit", async () => {
    const limited = await startServer({ MAX_CONNECTIONS_PER_MINUTE: 2 });
    const statusOf = () =>
      new Promise<number>((resolve) => {
        const socket = new WebSocket(limited.url);
        socket.on("open", () => {
          socket.close();
          resolve(101);
        });
        socket.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        socket.on("error", () => resolve(-1));
      });
    const results = [await statusOf(), await statusOf(), await statusOf()];
    await limited.stop();
    expect(results).toEqual([101, 101, 429]);
  });

  it("answers health checks", async () => {
    const res = await fetch(`http://127.0.0.1:${ctx.server.address.port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
