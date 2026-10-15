import { FilePlus2, Pencil, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button, Dialog, timeAgo } from "@syncscribe/editor/ui";
import { useDemo } from "../demo-context";
import { renameDocument, type DocumentEntry } from "../lib/documents";
import { docHref } from "../lib/route";
import { createSeededDocument, deleteEverywhere } from "../lib/workspace";

export function DocumentListPage() {
  const { store, documents, ready, refreshDocuments, history, broadcast, flash, setFlash } = useDemo();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<DocumentEntry | null>(null);
  const [deleting, setDeleting] = useState<DocumentEntry | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const result = await createSeededDocument(store);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refreshDocuments();
    window.location.hash = docHref(result.value.id);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { id, title } = deleting;
    setDeleting(null);
    // Tell open tabs first so they let go of the database before it is deleted.
    broadcast({ type: "document-deleted", docId: id });
    await deleteEverywhere(store, history, id);
    refreshDocuments();
    setFlash(`Deleted “${title}”.`);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your documents</h1>
          <p className="mt-1 text-sm text-ink-muted">Saved in this browser only. Nothing here leaves your machine.</p>
        </div>
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          <FilePlus2 aria-hidden className="size-4" />
          New document
        </Button>
      </div>

      <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm text-accent">
        {flash}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="mt-6 text-sm text-ink-muted">Loading…</p>
      ) : documents.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="font-medium">No documents yet</p>
          <p className="mt-1 text-sm text-ink-muted">Create one, then open it in a second tab to edit together.</p>
        </div>
      ) : (
        <ul aria-label="Documents" className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <a href={docHref(doc.id)} className="block truncate font-medium hover:underline">
                  {doc.title}
                </a>
                <p className="text-xs text-ink-muted">
                  Edited <time dateTime={new Date(doc.updatedAt).toISOString()}>{timeAgo(new Date(doc.updatedAt))}</time>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={() => setRenaming(doc)} aria-label={`Rename ${doc.title}`}>
                  <Pencil aria-hidden className="size-4" />
                  <span className="hidden sm:inline">Rename</span>
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(doc)} aria-label={`Delete ${doc.title}`}>
                  <Trash2 aria-hidden className="size-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RenameDialog
        entry={renaming}
        onClose={() => setRenaming(null)}
        onSave={(title) => {
          if (!renaming) return "Nothing to rename.";
          const result = renameDocument(store, renaming.id, title);
          if (!result.ok) return result.error;
          refreshDocuments();
          setRenaming(null);
          return null;
        }}
      />

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this document?"
        description={deleting ? `“${deleting.title}” and its version history will be removed from this browser.` : undefined}
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function RenameDialog({
  entry,
  onClose,
  onSave,
}: {
  entry: DocumentEntry | null;
  onClose: () => void;
  onSave: (title: string) => string | null;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastEntry, setLastEntry] = useState<DocumentEntry | null>(null);

  // Reset the field whenever a different document is picked.
  if (entry !== lastEntry) {
    setLastEntry(entry);
    setValue(entry?.title ?? "");
    setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    // There is nowhere to submit to; the CSP sets form-action 'none' as well.
    event.preventDefault();
    setError(onSave(value));
  }

  return (
    <Dialog open={entry !== null} onClose={onClose} title="Rename document">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          Title
        </label>
        <input
          id={inputId}
          value={value}
          maxLength={120}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="rounded-md border border-line bg-surface px-3 py-2"
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
