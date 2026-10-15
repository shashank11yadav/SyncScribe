import "server-only";
import { lt, sql } from "drizzle-orm";
import { rateLimits } from "@syncscribe/db";
import { getDb } from "./db";
import { RateLimitError } from "./errors";

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  share: { max: 20, windowSeconds: 600 },
  sandboxToken: { max: 60, windowSeconds: 60 },
  createDocument: { max: 30, windowSeconds: 600 },
} as const satisfies Record<string, Limit>;

/**
 * Fixed-window counter in a single upsert, so two concurrent requests cannot
 * both read "under the limit". Throws RateLimitError when the window is full.
 */
export async function consume(key: string, limit: Limit, now = new Date()): Promise<void> {
  const db = getDb();
  // ISO strings with explicit casts: the driver does not serialise Date objects inside raw SQL fragments.
  const cutoff = new Date(now.getTime() - limit.windowSeconds * 1000).toISOString();
  const nowIso = now.toISOString();

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Both expressions read the row as it was before this update.
        count: sql`case when ${rateLimits.windowStart} <= ${cutoff}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} <= ${cutoff}::timestamptz then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  // Opportunistic cleanup keeps the table small without a cron job.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000)));
  }

  if (row && row.count > limit.max) {
    const resetAt = row.windowStart.getTime() + limit.windowSeconds * 1000;
    throw new RateLimitError(Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)));
  }
}
