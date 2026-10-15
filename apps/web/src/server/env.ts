import "server-only";
import { z } from "zod";
import { syncSecretSchema } from "@syncscribe/shared";

const schema = z.object({
  DATABASE_URL: z.url(),
  SYNC_TOKEN_SECRET: syncSecretSchema,
  NEXT_PUBLIC_SYNC_URL: z.string().regex(/^wss?:\/\//, "NEXT_PUBLIC_SYNC_URL must be a ws:// or wss:// URL"),
});

let cached: z.infer<typeof schema> | null = null;

/** Parsed lazily so `next build` does not need production secrets. */
export function serverEnv(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server environment variables: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
