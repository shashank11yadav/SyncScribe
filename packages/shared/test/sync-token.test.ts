import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { SANDBOX_DOCUMENT, docDocumentName } from "../src/document-name";
import {
  SYNC_TOKEN_AUDIENCE,
  SYNC_TOKEN_ISSUER,
  SyncTokenError,
  signSyncToken,
  verifySyncToken,
  type SyncTokenClaims,
} from "../src/sync-token";

const secret = "test-secret-that-is-long-enough-for-hs256-0123456789";
const doc = docDocumentName("6f1c1c55-3a8e-4b8f-9d7c-2f1f5b7a9e10");
const claims: SyncTokenClaims = {
  sub: "user-1",
  kind: "user",
  doc,
  role: "editor",
  name: "Ada",
  color: "#026aa2",
};

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "accepted";
  } catch (error) {
    return error instanceof SyncTokenError ? error.reason : "other";
  }
}

describe("sync tokens", () => {
  it("round-trips valid claims", async () => {
    const token = await signSyncToken(claims, secret);
    await expect(verifySyncToken(token, secret, { expectedDocument: doc })).resolves.toMatchObject(claims);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSyncToken(claims, "another-secret-that-is-also-long-enough-000");
    expect(await reason(verifySyncToken(token, secret))).toBe("invalid");
  });

  it("rejects an expired token", async () => {
    const token = await signSyncToken(claims, secret, { now: new Date(Date.now() - 10 * 60_000), ttlSeconds: 60 });
    expect(await reason(verifySyncToken(token, secret))).toBe("expired");
  });

  it("rejects a token for a different document", async () => {
    const token = await signSyncToken(claims, secret);
    const other = docDocumentName("0b7d7d0e-55a4-4c1a-9a4b-6b0e3b0c9d11");
    expect(await reason(verifySyncToken(token, secret, { expectedDocument: other }))).toBe("scope");
  });

  it("rejects a tampered payload", async () => {
    const token = await signSyncToken(claims, secret);
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, role: "owner" })).toString("base64url");
    expect(await reason(verifySyncToken(`${header}.${forged}.${signature}`, secret))).toBe("invalid");
  });

  it("rejects the none algorithm", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ ...claims, iss: SYNC_TOKEN_ISSUER, aud: SYNC_TOKEN_AUDIENCE, exp: 9e9, iat: 1 })).toString("base64url");
    expect(await reason(verifySyncToken(`${header}.${body}.`, secret))).toBe("invalid");
  });

  it("rejects tokens with the wrong audience", async () => {
    const token = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(SYNC_TOKEN_ISSUER)
      .setAudience("someone-else")
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime("1m")
      .sign(new TextEncoder().encode(secret));
    expect(await reason(verifySyncToken(token, secret))).toBe("invalid");
  });

  it("rejects malformed claims even when correctly signed", async () => {
    const token = await new SignJWT({ ...claims, role: "superuser" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(SYNC_TOKEN_ISSUER)
      .setAudience(SYNC_TOKEN_AUDIENCE)
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime("1m")
      .sign(new TextEncoder().encode(secret));
    expect(await reason(verifySyncToken(token, secret))).toBe("malformed");
  });

  it("keeps guests inside the sandbox", async () => {
    await expect(signSyncToken({ ...claims, kind: "guest" }, secret)).rejects.toThrow(SyncTokenError);
    const guest = await signSyncToken({ ...claims, kind: "guest", doc: SANDBOX_DOCUMENT }, secret);
    await expect(verifySyncToken(guest, secret)).resolves.toMatchObject({ kind: "guest" });
  });

  it("keeps user tokens out of the sandbox namespace", async () => {
    await expect(signSyncToken({ ...claims, doc: SANDBOX_DOCUMENT }, secret)).rejects.toThrow(SyncTokenError);
  });

  it("rejects garbage and oversized input", async () => {
    expect(await reason(verifySyncToken("", secret))).toBe("malformed");
    expect(await reason(verifySyncToken("a".repeat(5000), secret))).toBe("malformed");
    expect(await reason(verifySyncToken("not.a.jwt", secret))).toBe("invalid");
  });

  it("refuses short secrets", async () => {
    await expect(signSyncToken(claims, "short")).rejects.toThrow();
  });
});
