import "server-only";
import { ZodError } from "zod";
import { AccessError, RateLimitError, UserFacingError } from "./errors";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ACCESS_MESSAGES = {
  unauthenticated: "Please sign in again.",
  not_found: "That document does not exist or you no longer have access.",
  forbidden: "Your role on this document does not allow that.",
} as const;

/**
 * Wraps a server action so callers always get a typed result and never an
 * internal error message. Kept outside the action body so redirect() and
 * notFound() are never swallowed by a catch.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, error: ACCESS_MESSAGES[error.code] };
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
    if (error instanceof RateLimitError) {
      return { ok: false, error: `Too many requests. Try again in ${error.retryAfterSeconds} seconds.` };
    }
    if (error instanceof UserFacingError) return { ok: false, error: error.message };
    console.error("server action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
