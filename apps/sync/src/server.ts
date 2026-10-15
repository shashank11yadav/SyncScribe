import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { Server, type Extension } from "@hocuspocus/server";
import * as Y from "yjs";
import { ACCESS_CHANNEL, type DbHandle } from "@syncscribe/db";
import { EDITOR_FIELD, SANDBOX_DOCUMENT, docDocumentName, docIdSchema, parseDocumentName, writeSandboxSeed } from "@syncscribe/shared";
import { AuthRejection, authenticate, type SyncContext } from "./auth";
import type { SyncConfig } from "./config";
import { log } from "./log";
import { loadDocumentState, storeDocumentState } from "./persistence";
import { UpgradeThrottle } from "./throttle";

export interface SyncServerOptions {
  config: SyncConfig;
  database: DbHandle;
}

function rejectUpgrade(socket: Duplex, status: string): never {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
  // Hocuspocus treats a thrown null as "handled, stop here".
  throw null;
}

export function createSyncServer({ config, database }: SyncServerOptions) {
  const { db, sql } = database;
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS);
  const throttle = new UpgradeThrottle(config.MAX_CONNECTIONS_PER_MINUTE, 60_000, config.TRUST_PROXY);
  const timers: NodeJS.Timeout[] = [];
  let unlisten: (() => Promise<void>) | null = null;

  const app: Extension = {
    extensionName: "syncscribe",

    async onUpgrade({ request, socket }: { request: IncomingMessage; socket: Duplex }) {
      // Browsers always send Origin on websocket upgrades. Rejecting unknown
      // origins stops other sites from driving a visitor's browser at us; the
      // token check below still applies to everything else.
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.has(origin)) {
        log("warn", "rejected websocket origin", { origin });
        rejectUpgrade(socket, "403 Forbidden");
      }
      if (!throttle.allow(throttle.clientAddress(request))) {
        log("warn", "throttled websocket upgrade");
        rejectUpgrade(socket, "429 Too Many Requests");
      }
    },

    async onRequest({ request, response }) {
      if (request.url === "/healthz") {
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ ok: true }));
        throw null;
      }
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
      throw null;
    },

    async onAuthenticate({ token, documentName, connectionConfig }) {
      try {
        const context = await authenticate(
          { token, documentName, connectionConfig },
          { db, secret: config.SYNC_TOKEN_SECRET },
        );
        log("info", "connection authenticated", {
          document: documentName,
          user: context.user.id,
          role: context.role,
          readOnly: connectionConfig.readOnly,
        });
        return context;
      } catch (error) {
        const reason = error instanceof AuthRejection ? error.reason : "forbidden";
        log("warn", "connection rejected", { document: documentName, reason });
        throw new AuthRejection(reason);
      }
    },

    async onLoadDocument({ documentName, document }) {
      const target = parseDocumentName(documentName);
      if (!target) throw new AuthRejection("unknown-document");
      if (target.kind === "doc") {
        await loadDocumentState(db, target.docId, document);
      } else if (document.getXmlFragment(EDITOR_FIELD).length === 0) {
        writeSandboxSeed(document);
      }
      return document;
    },

    async beforeHandleAwareness({ states, context }) {
      // Presence is stamped with the identity from the verified token, so a
      // client cannot show up under someone else's name or colour.
      const ctx = context as SyncContext | undefined;
      if (!ctx) return;
      for (const state of states.values()) {
        if (state && typeof state === "object" && "user" in state) {
          state.user = { name: ctx.user.name, color: ctx.user.color };
        }
      }
    },

    async onStoreDocument({ documentName, document, lastContext }) {
      const target = parseDocumentName(documentName);
      if (!target) return;
      if (target.kind === "sandbox") {
        // The sandbox lives in memory only. Cap its size so a visitor cannot
        // grow it without bound between scheduled resets.
        if (Y.encodeStateAsUpdate(document).byteLength > config.SANDBOX_MAX_BYTES) {
          writeSandboxSeed(document);
          log("info", "sandbox reset after exceeding size cap");
        }
        return;
      }
      const ctx = lastContext as SyncContext | undefined;
      const result = await storeDocumentState(db, target.docId, document, {
        snapshotIntervalMs: config.SNAPSHOT_INTERVAL_SECONDS * 1000,
        actorId: ctx?.user.kind === "user" ? ctx.user.id : null,
      });
      if (result.snapshotted) log("info", "auto snapshot recorded", { document: documentName });
    },

    async onListen() {
      const listener = await sql.listen(ACCESS_CHANNEL, (payload) => {
        const parsed = docIdSchema.safeParse(payload);
        if (!parsed.success) return;
        const name = docDocumentName(parsed.data);
        log("info", "access changed, dropping connections", { document: name });
        dropConnections(name);
      });
      unlisten = () => listener.unlisten();

      timers.push(
        setInterval(() => {
          void resetSandbox().catch((error: unknown) => log("error", "sandbox reset failed", { error: String(error) }));
        }, config.SANDBOX_RESET_MINUTES * 60_000),
      );
    },

    async onDestroy() {
      for (const timer of timers) clearInterval(timer);
      await unlisten?.();
    },
  };

  /**
   * Closes the sockets behind every connection to a document. A document-level
   * close would leave the socket open and the provider would sit there
   * unauthenticated; closing the socket makes it reconnect and fetch a fresh
   * token, which is where the new permissions take effect.
   */
  function dropConnections(name: string): void {
    const document = server.hocuspocus.documents.get(name);
    if (!document) return;
    for (const connection of Array.from(document.connections.keys())) {
      connection.webSocket.close(4001, "access-changed");
    }
  }

  async function resetSandbox(): Promise<void> {
    if (!server.hocuspocus.documents.has(SANDBOX_DOCUMENT)) return;
    const connection = await server.hocuspocus.openDirectConnection(SANDBOX_DOCUMENT);
    await connection.transact((doc) => writeSandboxSeed(doc));
    await connection.disconnect({ unloadImmediately: false });
    log("info", "sandbox reset");
  }

  const extensions: Extension[] = [app];

  const server = new Server({
    name: "syncscribe-sync",
    port: config.PORT,
    address: config.HOST,
    quiet: true,
    stopOnSignals: false,
    debounce: 2000,
    maxDebounce: 10_000,
    timeout: 30_000,
    websocketOptions: { maxPayload: 2 * 1024 * 1024 },
    extensions,
  });

  return { server, resetSandbox };
}
