import type { Editor } from "@tiptap/react";
import { Download, Eye, History, SquareArrowOutUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  CollaborativeSurface,
  EditorSkeleton,
  PeerAvatars,
  ReadOnlyNotice,
  RoleBadge,
  type PeerPresence,
} from "@syncscribe/editor";
import { can } from "@syncscribe/shared/roles";
import type { PMNode } from "@syncscribe/shared/markdown";
import { useDemo } from "../demo-context";
import { touchDocument, type DocumentEntry } from "../lib/documents";
import { downloadMarkdown } from "../lib/download";
import { LIST_HREF, docHref, type PreviewRole } from "../lib/route";
import { shouldAutoSnapshot } from "../lib/snapshots";
import { useLocalDocument, type LocalSession } from "../lib/use-local-document";
import { HistoryDialog } from "./HistoryDialog";
import { TitleField } from "./TitleField";

const CHECK_EVERY_MS = 15_000;
const TOUCH_EVERY_MS = 10_000;

export default function DocumentPage({ docId, role }: { docId: string; role: PreviewRole }) {
  const { documents, ready, setFlash } = useDemo();
  const entry = documents.find((d) => d.id === docId);

  useEffect(() => setFlash(null), [docId, setFlash]);

  if (!entry) {
    if (!ready) return <Shell><EditorSkeleton /></Shell>;
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">This document is not in this browser</h1>
        <p className="mt-2 text-ink-muted">
          It may have been deleted, or it was created in a different browser. Demo documents never leave the browser
          they were made in.
        </p>
        <a href={LIST_HREF} className="mt-4 inline-block text-accent underline">
          Back to your documents
        </a>
      </Shell>
    );
  }
  return <DocumentEditor key={`${docId}:${role}`} entry={entry} role={role} />;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>;
}

function DocumentEditor({ entry, role }: { entry: DocumentEntry; role: PreviewRole }) {
  const { store, identity, history, broadcast, subscribe, setFlash } = useDemo();
  const { session, status, peers } = useLocalDocument(entry.id);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const canEdit = can(role, "doc.edit");

  useEffect(
    () =>
      subscribe((message) => {
        if (message.docId !== entry.id) return;
        if (message.type === "document-deleted") {
          setFlash(`“${entry.title}” was deleted in another tab.`);
          window.location.hash = LIST_HREF;
        } else {
          setHistoryRevision((n) => n + 1);
        }
      }),
    [subscribe, entry.id, entry.title, setFlash],
  );

  useAutoSnapshots(session, canEdit, {
    onLocalEdit: () => touchDocument(store, entry.id),
    save: async (doc) => {
      const result = await history.save(entry.id, doc, { kind: "auto", author: identity.name });
      if (result.saved) {
        broadcast({ type: "history-changed", docId: entry.id });
        setHistoryRevision((n) => n + 1);
      }
    },
  });

  const onEditor = useCallback((next: Editor | null) => setEditor(next), []);

  function openTab(target: PreviewRole) {
    window.open(`${window.location.pathname}${docHref(entry.id, target)}`, "_blank", "noopener");
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TitleField entry={entry} editable={can(role, "doc.rename")} />
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={role} />
          {can(role, "doc.history") ? (
            <Button onClick={() => setHistoryOpen(true)} disabled={!session}>
              <History aria-hidden className="size-4" />
              History
            </Button>
          ) : null}
          <Button onClick={() => editor && downloadMarkdown(editor.getJSON() as PMNode, entry.title)} disabled={!editor}>
            <Download aria-hidden className="size-4" />
            <span>
              Export<span className="sr-only"> as Markdown</span>
            </span>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabPresence peers={peers} connected={session !== null} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openTab("owner")}>
              <SquareArrowOutUpRight aria-hidden className="size-4" />
              Open in a new tab
            </Button>
            {role === "owner" ? (
              <Button onClick={() => openTab("viewer")}>
                <Eye aria-hidden className="size-4" />
                Open as viewer
              </Button>
            ) : null}
          </div>
        </div>

        {status === "unavailable" ? (
          <p role="alert" className="rounded-md border border-line bg-danger-soft px-3 py-2 text-sm">
            This tab could not read the saved copy of this document. Edits still reach your other tabs, but may not
            survive a reload.
          </p>
        ) : null}

        {session ? (
          <CollaborativeSurface
            doc={session.doc}
            provider={session.provider}
            user={identity}
            canEdit={canEdit}
            ready={status !== "loading"}
            label="Document body"
            onEditor={onEditor}
            notice={
              role === "viewer" ? (
                <ReadOnlyNotice>
                  <strong className="font-semibold text-ink">Viewer preview.</strong> This tab hides the editing
                  controls to show what someone with view access sees. It is a UI preview only: in the full app the
                  sync server opens viewer connections read-only and discards anything they send.
                </ReadOnlyNotice>
              ) : null
            }
          />
        ) : (
          <EditorSkeleton />
        )}
      </div>

      {session && can(role, "doc.history") ? (
        <HistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          docId={entry.id}
          doc={session.doc}
          liveEditor={editor}
          author={identity.name}
          revision={historyRevision}
          onChanged={() => broadcast({ type: "history-changed", docId: entry.id })}
        />
      ) : null}
    </Shell>
  );
}

function TabPresence({ peers, connected }: { peers: PeerPresence[]; connected: boolean }) {
  const { identity } = useDemo();
  const text = !connected
    ? "Opening"
    : peers.length === 0
      ? "Only this tab"
      : `Live with ${peers.length} other ${peers.length === 1 ? "tab" : "tabs"}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PeerAvatars peers={peers} />
      <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <span aria-hidden className={`size-2 rounded-full ${peers.length > 0 ? "bg-accent" : "bg-ink-muted"}`} />
        {text}
      </p>
      <p className="text-xs text-ink-muted">
        You are <span className="font-medium text-ink">{identity.name}</span>
      </p>
    </div>
  );
}

/**
 * Saves an automatic version every couple of minutes while this tab is the one
 * typing. Remote edits and the initial load do not count as typing.
 */
function useAutoSnapshots(
  session: LocalSession | null,
  enabled: boolean,
  handlers: { onLocalEdit: () => void; save: (doc: LocalSession["doc"]) => Promise<void> },
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!session || !enabled) return;
    const { doc, provider, persistence } = session;
    let dirty = false;
    let lastSavedAt = Date.now();
    let lastTouchedAt = 0;

    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider || origin === persistence) return;
      dirty = true;
      const now = Date.now();
      if (now - lastTouchedAt > TOUCH_EVERY_MS) {
        lastTouchedAt = now;
        latest.current.onLocalEdit();
      }
    };
    doc.on("update", onUpdate);

    const timer = setInterval(() => {
      const now = Date.now();
      if (!shouldAutoSnapshot({ dirty, lastSavedAt, now })) return;
      dirty = false;
      lastSavedAt = now;
      void latest.current.save(doc).catch(() => {
        // History is a convenience here; a failed automatic save is retried on the next edit.
        dirty = true;
      });
    }, CHECK_EVERY_MS);

    return () => {
      doc.off("update", onUpdate);
      clearInterval(timer);
    };
  }, [session, enabled]);
}
