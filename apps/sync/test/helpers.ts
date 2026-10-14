import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { createDb } from "@syncscribe/db";
import { colorFor, signSyncToken, type SyncTokenClaims } from "@syncscribe/shared";
import { TEST_SYNC_SECRET, testDatabaseUrl } from "../../../test/env";
import type { SyncConfig } from "../src/config";
import { createSyncServer } from "../src/server";

export async function startServer(overrides: Partial<SyncConfig> = {}) {
  process.env.SYNC_QUIET = "1";
  const database = createDb(testDatabaseUrl(), { max: 4 });
  const config: SyncConfig = {
    PORT: 0,
    HOST: "127.0.0.1",
    DATABASE_URL: testDatabaseUrl(),
    SYNC_TOKEN_SECRET: TEST_SYNC_SECRET,
    ALLOWED_ORIGINS: ["http://localhost:5200"],
    SNAPSHOT_INTERVAL_SECONDS: 600,
    SANDBOX_RESET_MINUTES: 30,
    SANDBOX_MAX_BYTES: 256 * 1024,
    ...overrides,
  };
  const { server, resetSandbox } = createSyncServer({ config, database, throttle: false });
  await server.listen();
  const url = `ws://127.0.0.1:${server.address.port}`;
  return {
    server,
    database,
    url,
    resetSandbox,
    async stop() {
      await server.destroy();
      await database.sql.end({ timeout: 2 });
    },
  };
}

export function tokenFor(claims: Partial<SyncTokenClaims> & Pick<SyncTokenClaims, "sub" | "doc" | "role">, options?: Parameters<typeof signSyncToken>[2]) {
  return signSyncToken(
    { kind: "user", name: claims.sub.slice(0, 20), color: colorFor(claims.sub), ...claims },
    TEST_SYNC_SECRET,
    options,
  );
}

export type ConnectResult =
  | { status: "authenticated"; scope: string; provider: HocuspocusProvider; doc: Y.Doc }
  | { status: "denied"; reason: string; provider: HocuspocusProvider; doc: Y.Doc };

/** Opens a provider and resolves once the server has accepted or refused it. */
export function connect(url: string, name: string, token: string | (() => Promise<string>)): Promise<ConnectResult> {
  const doc = new Y.Doc();
  return new Promise((resolve) => {
    const provider: HocuspocusProvider = new HocuspocusProvider({
      url,
      name,
      document: doc,
      token,
      onSynced: () => resolve({ status: "authenticated", scope: provider.authorizedScope ?? "unknown", provider, doc }),
      onAuthenticationFailed: ({ reason }) => resolve({ status: "denied", reason, provider, doc }),
    });
  });
}

export function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timed out waiting for condition"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function writeParagraph(doc: Y.Doc, text: string): void {
  const paragraph = new Y.XmlElement("paragraph");
  const content = new Y.XmlText();
  content.insert(0, text);
  paragraph.insert(0, [content]);
  doc.getXmlFragment("default").push([paragraph]);
}

export function textOf(doc: Y.Doc): string {
  return doc.getXmlFragment("default").toString();
}
