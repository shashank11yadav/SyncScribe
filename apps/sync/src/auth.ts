import { and, eq } from "drizzle-orm";
import type { ConnectionConfiguration } from "@hocuspocus/server";
import { documentMembers, type Database } from "@syncscribe/db";
import {
  SyncTokenError,
  lowerRole,
  parseDocumentName,
  roleAtLeast,
  verifySyncToken,
  type Role,
} from "@syncscribe/shared";

export interface SyncContext {
  user: { id: string; name: string; color: string; kind: "user" | "guest" };
  role: Role;
}

/** Hocuspocus forwards `reason` to the client in the permission-denied message. */
export class AuthRejection extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "AuthRejection";
  }
}

export interface AuthenticateInput {
  token: string;
  documentName: string;
  connectionConfig: ConnectionConfiguration;
}

export async function authenticate(
  input: AuthenticateInput,
  deps: { db: Database; secret: string },
): Promise<SyncContext> {
  const target = parseDocumentName(input.documentName);
  if (!target) throw new AuthRejection("unknown-document");

  let claims;
  try {
    claims = await verifySyncToken(input.token, deps.secret, { expectedDocument: input.documentName });
  } catch (error) {
    const reason = error instanceof SyncTokenError && error.reason === "expired" ? "token-expired" : "invalid-token";
    throw new AuthRejection(reason);
  }

  let role: Role = claims.role;
  if (target.kind === "doc") {
    // The token says what the web app believed a moment ago. The database says
    // what is true now. Take the weaker of the two so a revoked or downgraded
    // member cannot ride out the token's remaining lifetime.
    const [member] = await deps.db
      .select({ role: documentMembers.role })
      .from(documentMembers)
      .where(and(eq(documentMembers.documentId, target.docId), eq(documentMembers.userId, claims.sub)))
      .limit(1);
    if (!member) throw new AuthRejection("forbidden");
    role = lowerRole(role, member.role);
  }

  input.connectionConfig.readOnly = !roleAtLeast(role, "editor");

  return {
    user: { id: claims.sub, name: claims.name, color: claims.color, kind: claims.kind },
    role,
  };
}
