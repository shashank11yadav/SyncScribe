import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { SANDBOX_DOCUMENT, colorFor, guestNameFor, signSyncToken } from "@syncscribe/shared";
import { serverEnv } from "@/server/env";
import { assertSameOrigin, handle, json } from "@/server/http";
import { LIMITS, consume } from "@/server/rate-limit";

const GUEST_COOKIE = "ss_guest";
const guestId = /^[0-9a-f-]{36}$/;

function clientKey(forwardedFor: string | null, realIp: string | null): string {
  // On Vercel x-real-ip is set by the platform. Hash it so raw addresses are never stored.
  const ip = realIp ?? forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Guest tokens are only ever valid for the sandbox document. The guest id
 * lives in an httpOnly cookie so a visitor keeps the same name across reloads.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const h = await headers();
    await consume(`sandbox:${clientKey(h.get("x-forwarded-for"), h.get("x-real-ip"))}`, LIMITS.sandboxToken);

    const jar = await cookies();
    let id = jar.get(GUEST_COOKIE)?.value;
    if (!id || !guestId.test(id)) {
      id = randomUUID();
      jar.set(GUEST_COOKIE, id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    const token = await signSyncToken(
      { sub: `guest:${id}`, kind: "guest", doc: SANDBOX_DOCUMENT, role: "editor", name: guestNameFor(id), color: colorFor(id) },
      serverEnv().SYNC_TOKEN_SECRET,
    );
    return json({ token, name: guestNameFor(id) });
  });
}
