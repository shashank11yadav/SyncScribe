import { z } from "zod";
import { syncSecretSchema } from "@syncscribe/shared";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5201),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.url(),
  SYNC_TOKEN_SECRET: syncSecretSchema,
  // Comma-separated list of web origins allowed to open a websocket.
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5200")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SNAPSHOT_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(600),
  SANDBOX_RESET_MINUTES: z.coerce.number().int().min(1).default(30),
  SANDBOX_MAX_BYTES: z.coerce.number().int().min(1024).default(256 * 1024),
});

export type SyncConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid sync server configuration: ${fields}`);
  }
  return parsed.data;
}
