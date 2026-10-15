import { randomBytes, randomUUID } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import { createDb, documentMembers, documents, sessions, users } from "@syncscribe/db";
import type { Role } from "@syncscribe/shared";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set for e2e tests");

export const { db, sql } = createDb(url, { max: 2 });

export interface SeededUser {
  id: string;
  name: string;
  email: string;
  sessionToken: string;
}

/**
 * Creates a user with a live database session. This stands in for the GitHub
 * OAuth round trip, which cannot run in CI; everything after the cookie is the
 * real Auth.js session lookup.
 */
export async function seedUser(name: string): Promise<SeededUser> {
  const id = randomUUID();
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${id.slice(0, 8)}@e2e.syncscribe.dev`;
  await db.insert(users).values({ id, name, email });
  const sessionToken = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ sessionToken, userId: id, expires: new Date(Date.now() + 3_600_000) });
  return { id, name, email, sessionToken };
}

export async function seedDocument(title: string, members: Array<{ user: SeededUser; role: Role }>) {
  const [doc] = await db.insert(documents).values({ title }).returning();
  await db.insert(documentMembers).values(members.map((m) => ({ documentId: doc!.id, userId: m.user.id, role: m.role })));
  return doc!;
}

export async function contextFor(browser: Browser, user: SeededUser | null): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (user) {
    await context.addCookies([
      { name: "authjs.session-token", value: user.sessionToken, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
  }
  return context;
}
