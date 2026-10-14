import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { z } from "zod";
import { documentNameSchema, parseDocumentName } from "./document-name";
import { roleSchema } from "./schemas";

/**
 * Short-lived tokens the web app mints for one user, one document and one role.
 * The sync server accepts nothing else, so the browser never gets to state its
 * own identity or permissions over the websocket.
 */

export const SYNC_TOKEN_ISSUER = "syncscribe-web";
export const SYNC_TOKEN_AUDIENCE = "syncscribe-sync";
export const SYNC_TOKEN_TTL_SECONDS = 120;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const syncTokenClaimsSchema = z.object({
  sub: z.string().min(1).max(100),
  kind: z.enum(["user", "guest"]),
  doc: documentNameSchema,
  role: roleSchema,
  name: z.string().min(1).max(80),
  color: hexColor,
});

export type SyncTokenClaims = z.infer<typeof syncTokenClaimsSchema>;

export class SyncTokenError extends Error {
  constructor(
    public readonly reason: "malformed" | "expired" | "invalid" | "scope",
    message: string,
  ) {
    super(message);
    this.name = "SyncTokenError";
  }
}

export const syncSecretSchema = z
  .string()
  .min(32, "SYNC_TOKEN_SECRET must be at least 32 characters");

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(syncSecretSchema.parse(secret));
}

/** Guests may only touch the sandbox, signed-in users only real documents. */
function assertScope(claims: SyncTokenClaims): void {
  const target = parseDocumentName(claims.doc);
  if (!target) throw new SyncTokenError("scope", "Unknown document");
  if (claims.kind === "guest" && target.kind !== "sandbox") {
    throw new SyncTokenError("scope", "Guest tokens are limited to the sandbox");
  }
  if (claims.kind === "user" && target.kind !== "doc") {
    throw new SyncTokenError("scope", "User tokens are limited to documents");
  }
  if (target.kind === "sandbox" && claims.role === "owner") {
    throw new SyncTokenError("scope", "Nobody owns the sandbox");
  }
}

export async function signSyncToken(
  claims: SyncTokenClaims,
  secret: string,
  options: { ttlSeconds?: number; now?: Date } = {},
): Promise<string> {
  const parsed = syncTokenClaimsSchema.parse(claims);
  assertScope(parsed);
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const ttl = options.ttlSeconds ?? SYNC_TOKEN_TTL_SECONDS;
  return new SignJWT({ kind: parsed.kind, doc: parsed.doc, role: parsed.role, name: parsed.name, color: parsed.color })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(parsed.sub)
    .setIssuer(SYNC_TOKEN_ISSUER)
    .setAudience(SYNC_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttl)
    .setJti(crypto.randomUUID())
    .sign(keyFrom(secret));
}

export async function verifySyncToken(
  token: string,
  secret: string,
  options: { expectedDocument?: string; currentDate?: Date } = {},
): Promise<SyncTokenClaims> {
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    throw new SyncTokenError("malformed", "Missing or oversized token");
  }

  let payload: unknown;
  try {
    const result = await jwtVerify(token, keyFrom(secret), {
      issuer: SYNC_TOKEN_ISSUER,
      audience: SYNC_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 5,
      ...(options.currentDate ? { currentDate: options.currentDate } : {}),
    });
    payload = result.payload;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new SyncTokenError("expired", "Token expired");
    }
    throw new SyncTokenError("invalid", "Token signature or claims are invalid");
  }

  const parsed = syncTokenClaimsSchema.safeParse(payload);
  if (!parsed.success) throw new SyncTokenError("malformed", "Token claims are malformed");

  assertScope(parsed.data);
  if (options.expectedDocument !== undefined && parsed.data.doc !== options.expectedDocument) {
    throw new SyncTokenError("scope", "Token was issued for a different document");
  }
  return parsed.data;
}
