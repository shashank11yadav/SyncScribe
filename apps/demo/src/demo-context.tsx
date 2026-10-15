import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openControlChannel } from "./lib/control-channel";
import { loadDocuments, type DocumentEntry } from "./lib/documents";
import { HistoryStore } from "./lib/history";
import { createTabIdentity, type TabIdentity } from "./lib/identity";
import { DOCUMENTS_KEY } from "./lib/keys";
import type { ControlMessage } from "./lib/messages";
import { openBrowserStore, type KeyValueStore } from "./lib/storage";
import { ensureWelcomeDocument } from "./lib/workspace";

type Listener = (message: ControlMessage) => void;

interface DemoContextValue {
  store: KeyValueStore;
  persistent: boolean;
  history: HistoryStore;
  identity: TabIdentity;
  documents: DocumentEntry[];
  /** True once the first-visit welcome document has been written (or skipped). */
  ready: boolean;
  refreshDocuments: () => void;
  broadcast: (message: ControlMessage) => void;
  subscribe: (listener: Listener) => () => void;
  flash: string | null;
  setFlash: (message: string | null) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [{ store, persistent }] = useState(openBrowserStore);
  const [history] = useState(() => new HistoryStore());
  const [identity] = useState(() => createTabIdentity());
  const [documents, setDocuments] = useState<DocumentEntry[]>(() => loadDocuments(store));
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [listeners] = useState(() => new Set<Listener>());
  const control = useRef<ReturnType<typeof openControlChannel> | null>(null);

  const refreshDocuments = useCallback(() => setDocuments(loadDocuments(store)), [store]);

  useEffect(() => {
    let cancelled = false;
    void ensureWelcomeDocument(store).then(() => {
      if (cancelled) return;
      refreshDocuments();
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store, refreshDocuments]);

  useEffect(() => {
    // Other tabs write the list to localStorage; the storage event tells this one.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === DOCUMENTS_KEY) refreshDocuments();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshDocuments]);

  useEffect(() => {
    const channel = openControlChannel((message) => listeners.forEach((listener) => listener(message)));
    control.current = channel;
    return () => {
      channel.close();
      control.current = null;
    };
  }, [listeners]);

  useEffect(() => () => void history.close(), [history]);

  const value = useMemo<DemoContextValue>(
    () => ({
      store,
      persistent,
      history,
      identity,
      documents,
      ready,
      refreshDocuments,
      broadcast: (message) => control.current?.post(message),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      flash,
      setFlash,
    }),
    [store, persistent, history, identity, documents, ready, refreshDocuments, listeners, flash],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider");
  return value;
}
