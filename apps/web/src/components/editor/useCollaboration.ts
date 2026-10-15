"use client";

import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

export type AccessState = "pending" | "read-write" | "readonly" | "lost";

export interface PeerPresence {
  clientId: number;
  name: string;
  color: string;
}

export class TokenRequestError extends Error {
  constructor(public readonly status: number) {
    super(`token request failed with ${status}`);
  }
}

/**
 * Owns the Y.Doc and websocket provider for one document. Created inside an
 * effect (not during render) so React strict mode's double mount cannot leave
 * a second socket running.
 */
export function useCollaboration(options: {
  syncUrl: string;
  documentName: string;
  fetchToken: () => Promise<string>;
}) {
  const { syncUrl, documentName } = options;
  const fetchToken = useRef(options.fetchToken);
  useEffect(() => {
    fetchToken.current = options.fetchToken;
  }, [options.fetchToken]);

  const [session, setSession] = useState<{ doc: Y.Doc; provider: HocuspocusProvider } | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.Connecting);
  const [access, setAccess] = useState<AccessState>("pending");
  const [synced, setSynced] = useState(false);
  const [peers, setPeers] = useState<PeerPresence[]>([]);

  useEffect(() => {
    const doc = new Y.Doc();
    let lost = false;

    const provider = new HocuspocusProvider({
      url: syncUrl,
      name: documentName,
      document: doc,
      // Called on every (re)connect, so a role change takes effect on the next connection.
      token: async () => {
        try {
          return await fetchToken.current();
        } catch (error) {
          if (error instanceof TokenRequestError && [401, 403, 404].includes(error.status)) {
            lost = true;
            setAccess("lost");
            queueMicrotask(() => provider.destroy());
          }
          throw error;
        }
      },
      onStatus: ({ status: next }) => setStatus(next),
      onAuthenticated: ({ scope }) => setAccess(scope === "read-write" ? "read-write" : "readonly"),
      onAuthenticationFailed: () => {
        lost = true;
        setAccess("lost");
      },
      onSynced: ({ state }) => setSynced(state),
      onAwarenessChange: ({ states }) => {
        setPeers(
          states
            .filter((s) => s.clientId !== doc.clientID && s.user && typeof s.user.name === "string")
            .map((s) => ({ clientId: s.clientId, name: String(s.user.name), color: String(s.user.color ?? "#57534e") })),
        );
      },
    });

    setSession({ doc, provider });
    return () => {
      if (!lost) provider.destroy();
      doc.destroy();
      setSession(null);
      setSynced(false);
      setAccess("pending");
    };
  }, [syncUrl, documentName]);

  return { session, status, access, synced, peers };
}
