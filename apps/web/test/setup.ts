import { vi } from "vitest";
import { TEST_SYNC_SECRET, testDatabaseUrl } from "../../../test/env";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SYNC_TOKEN_SECRET = TEST_SYNC_SECRET;
process.env.NEXT_PUBLIC_SYNC_URL = "ws://localhost:5201";

// The only thing faked is who is signed in (and Next's request-scoped APIs,
// which do not exist outside a request). The database and every permission
// check are the real code path.
vi.mock("@/auth", async () => {
  const { session } = await import("./state");
  return {
    auth: vi.fn(async () =>
      session.user ? { user: session.user, expires: new Date(Date.now() + 60_000).toISOString() } : null,
    ),
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  };
});

vi.mock("@/server/db", async () => {
  const { handle } = await import("./state");
  return { getDb: () => handle.db };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("next/headers", async () => {
  const { requestHeaders, cookieJar } = await import("./state");
  return {
    headers: async () => requestHeaders.current,
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
      set: (name: string, value: string) => void cookieJar.set(name, value),
    }),
  };
});
