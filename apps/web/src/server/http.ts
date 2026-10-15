import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AccessError, RateLimitError } from "./errors";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

/**
 * Route handlers do not get Next's built-in server-action origin check, so
 * state-changing ones call this. Session cookies are SameSite=Lax as well;
 * this is the second lock on the door.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new AccessError("forbidden");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AccessError("forbidden");
  }
  if (originHost !== host) throw new AccessError("forbidden");
}

/** Maps thrown errors to HTTP responses without leaking internals. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AccessError) {
      const status = error.code === "unauthenticated" ? 401 : error.code === "forbidden" ? 403 : 404;
      return json({ error: error.code }, { status });
    }
    if (error instanceof ZodError) return json({ error: "invalid_request" }, { status: 400 });
    if (error instanceof RateLimitError) {
      return json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    console.error("route handler failed", error);
    return json({ error: "internal_error" }, { status: 500 });
  }
}
