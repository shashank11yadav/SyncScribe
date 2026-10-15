import { useEffect, useState } from "react";
import * as Y from "yjs";
import { peersFromStates, type PeerPresence } from "@syncscribe/editor";
import type { IndexeddbPersistence } from "y-indexeddb";
import { BroadcastProvider } from "./broadcast-provider";
import { docChannelName } from "./keys";
import { openLocalCopy, type LoadStatus } from "./local-copy";

export interface LocalSession {
  doc: Y.Doc;
  provider: BroadcastProvider;
  persistence: IndexeddbPersistence | null;
}

/**
 * Owns the Y.Doc, its IndexedDB copy and the tab-to-tab provider for one
 * document. Everything is created inside the effect so React strict mode's
 * double mount cannot leave a second channel open.
 */
export function useLocalDocument(docId: string) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [status, setStatus] = useState<LoadStatus | "loading">("loading");
  const [peers, setPeers] = useState<PeerPresence[]>([]);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new BroadcastProvider(doc, docChannelName(docId));
    let persistence: IndexeddbPersistence | null = null;
    let cancelled = false;

    const onAwareness = () => setPeers(peersFromStates(provider.awareness.getStates(), doc.clientID));
    provider.awareness.on("change", onAwareness);

    // Load the saved copy first, then join the other tabs, so this tab offers
    // its stored edits in the first exchange.
    void openLocalCopy(docId, doc).then((copy) => {
      if (cancelled) {
        void copy.persistence?.destroy();
        return;
      }
      persistence = copy.persistence;
      provider.connect();
      setSession({ doc, provider, persistence });
      setStatus(copy.status);
    });

    return () => {
      cancelled = true;
      provider.awareness.off("change", onAwareness);
      provider.destroy();
      void persistence?.destroy();
      doc.destroy();
      setSession(null);
      setStatus("loading");
      setPeers([]);
    };
  }, [docId]);

  return { session, status, peers };
}
