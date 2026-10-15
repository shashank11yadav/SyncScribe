"use client";

import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Dialog, timeAgo, VersionPreview } from "@syncscribe/editor";
import { createSnapshot } from "@/server/actions/versions";

interface Version {
  id: string;
  kind: "auto" | "manual";
  createdAt: string;
  author: string | null;
}

/**
 * Restoring writes the old content into the live document as an ordinary
 * edit. Collaborators see it arrive like any other change, and a snapshot of
 * the current text is saved first so the restore can itself be undone.
 */
export function HistoryDialog({
  open,
  onClose,
  docId,
  liveEditor,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  liveEditor: Editor | null;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<JSONContent | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/${docId}/versions`, { cache: "no-store" });
    if (!res.ok) {
      setMessage({ tone: "error", text: "Could not load history." });
      return;
    }
    const body = (await res.json()) as { versions: Version[] };
    setVersions(body.versions);
  }, [docId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches when the dialog opens
    if (open) void load();
  }, [open, load]);

  async function select(id: string) {
    setSelected(id);
    setContent(null);
    const res = await fetch(`/api/documents/${docId}/versions/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setMessage({ tone: "error", text: "Could not load that version." });
      return;
    }
    const body = (await res.json()) as { content: JSONContent };
    setContent(body.content);
  }

  function saveNow() {
    startTransition(async () => {
      const result = await createSnapshot({ docId });
      setMessage(result.ok ? { tone: "ok", text: "Version saved." } : { tone: "error", text: result.error });
      if (result.ok) await load();
    });
  }

  function restore() {
    if (!content || !liveEditor) return;
    startTransition(async () => {
      const backup = await createSnapshot({ docId });
      if (!backup.ok && !backup.error.startsWith("Nothing to save")) {
        setMessage({ tone: "error", text: backup.error });
        return;
      }
      liveEditor.commands.setContent(content);
      setMessage({ tone: "ok", text: "Version restored. The previous text was saved to history." });
      await load();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Version history" description="Snapshots are taken every few minutes while people edit." wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className={`text-sm ${message?.tone === "error" ? "text-danger" : "text-accent"}`}>
          {message?.text}
        </p>
        <Button onClick={saveNow} disabled={pending}>
          Save a version now
        </Button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[14rem_1fr]">
        <div>
          {versions === null ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-ink-muted">No versions yet. One is saved shortly after the first edit.</p>
          ) : (
            <ul aria-label="Versions" className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => void select(version.id)}
                    aria-current={selected === version.id ? "true" : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted ${
                      selected === version.id ? "bg-accent-soft" : ""
                    }`}
                  >
                    <span className="block font-medium">
                      <time dateTime={version.createdAt}>{timeAgo(version.createdAt)}</time>
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {version.kind === "manual" ? "Saved" : "Auto"}
                      {version.author ? ` · ${version.author}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-h-48 rounded-lg border border-line bg-paper p-4">
          {selected === null ? (
            <p className="text-sm text-ink-muted">Pick a version to preview it.</p>
          ) : content === null ? (
            <p className="text-sm text-ink-muted">Loading preview…</p>
          ) : (
            <>
              <VersionPreview content={content} />
              <div className="mt-4 border-t border-line pt-3">
                <Button variant="primary" onClick={restore} disabled={pending || !liveEditor}>
                  Restore this version
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
