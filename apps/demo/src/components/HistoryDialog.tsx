import type { Editor, JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";
import type * as Y from "yjs";
import { Button, Dialog, timeAgo, VersionPreview } from "@syncscribe/editor";
import { stateToProseMirror } from "@syncscribe/editor/state";
import { useDemo } from "../demo-context";
import type { VersionSummary } from "../lib/history";

type Message = { tone: "ok" | "error"; text: string } | null;

/**
 * Restoring writes the old content into the live document as an ordinary
 * edit, exactly as in the full app. Other tabs see it arrive like any other
 * change, and the current text is saved first so the restore can be undone.
 */
export function HistoryDialog({
  open,
  onClose,
  docId,
  doc,
  liveEditor,
  author,
  revision,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  doc: Y.Doc;
  liveEditor: Editor | null;
  author: string;
  /** Bumped when another tab or an automatic snapshot changes the history. */
  revision: number;
  onChanged: () => void;
}) {
  const { history } = useDemo();
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<JSONContent | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setVersions(await history.list(docId));
    } catch {
      setMessage({ tone: "error", text: "This browser would not open the history database." });
      setVersions([]);
    }
  }, [history, docId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the dialog opens or history changes
    if (open) void load();
  }, [open, load, revision]);

  async function select(id: string) {
    setSelected(id);
    setContent(null);
    try {
      const record = await history.get(docId, id);
      if (!record) {
        setMessage({ tone: "error", text: "That version could not be read." });
        return;
      }
      setContent(stateToProseMirror(record.state) as JSONContent);
    } catch {
      setMessage({ tone: "error", text: "That version could not be read." });
    }
  }

  async function saveNow() {
    setPending(true);
    try {
      const result = await history.save(docId, doc, { kind: "manual", author });
      setMessage(result.saved ? { tone: "ok", text: "Version saved." } : { tone: "ok", text: "Nothing has changed since the last version." });
      if (result.saved) onChanged();
      await load();
    } catch {
      setMessage({ tone: "error", text: "Could not save a version in this browser." });
    } finally {
      setPending(false);
    }
  }

  async function restore() {
    if (!content || !liveEditor) return;
    setPending(true);
    try {
      await history.save(docId, doc, { kind: "manual", author });
      liveEditor.commands.setContent(content);
      setMessage({ tone: "ok", text: "Version restored. The previous text was saved to history." });
      onChanged();
      await load();
    } catch {
      setMessage({ tone: "error", text: "Could not save the current text first, so nothing was restored." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Version history"
      description="Saved in this browser. A version is taken every couple of minutes while you type, or when you save one."
      wide
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className={`text-sm ${message?.tone === "error" ? "text-danger" : "text-accent"}`}>
          {message?.text}
        </p>
        <Button onClick={() => void saveNow()} disabled={pending}>
          Save a version now
        </Button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[14rem_1fr]">
        <div>
          {versions === null ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-ink-muted">No versions yet. Save one, or keep typing for a couple of minutes.</p>
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
                      <time dateTime={new Date(version.createdAt).toISOString()}>{timeAgo(new Date(version.createdAt))}</time>
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {version.kind === "manual" ? "Saved" : "Auto"} · {version.author}
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
                <Button variant="primary" onClick={() => void restore()} disabled={pending || !liveEditor}>
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
