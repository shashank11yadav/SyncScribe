import { useEffect, useRef, useState } from "react";
import { titleSchema } from "@syncscribe/shared/schemas";
import { useDemo } from "../demo-context";
import { renameDocument, type DocumentEntry } from "../lib/documents";

const DEBOUNCE_MS = 500;

type SaveState = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

/** Same behaviour as the full app's title field, saving to the local document list instead of a server action. */
export function TitleField({ entry, editable }: { entry: DocumentEntry; editable: boolean }) {
  const { store, refreshDocuments } = useDemo();
  const [value, setValue] = useState(entry.title);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [prevTitle, setPrevTitle] = useState(entry.title);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A rename from another tab shows up here unless this tab is mid-edit.
  if (entry.title !== prevTitle) {
    setPrevTitle(entry.title);
    if (!focused) setValue(entry.title);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!editable) {
    return <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{entry.title}</h1>;
  }

  function schedule(next: string) {
    if (timer.current) clearTimeout(timer.current);
    const parsed = titleSchema.safeParse(next);
    if (!parsed.success) {
      setState({ kind: "error", message: parsed.error.issues[0]?.message ?? "Invalid title" });
      return;
    }
    if (parsed.data === entry.title) {
      setState({ kind: "idle" });
      return;
    }
    timer.current = setTimeout(() => {
      const result = renameDocument(store, entry.id, parsed.data);
      setState(result.ok ? { kind: "saved" } : { kind: "error", message: result.error });
      if (result.ok) refreshDocuments();
    }, DEBOUNCE_MS);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <h1 className="sr-only">{value}</h1>
      <label htmlFor="doc-title" className="sr-only">
        Document title
      </label>
      <input
        id="doc-title"
        value={value}
        maxLength={120}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setValue(event.target.value);
          schedule(event.target.value);
        }}
        className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-2xl font-semibold tracking-tight hover:border-line focus:border-line"
        aria-describedby="doc-title-status"
      />
      <p
        id="doc-title-status"
        role="status"
        aria-live="polite"
        className={`px-1 text-xs ${state.kind === "error" ? "text-danger" : "text-ink-muted"}`}
      >
        {state.kind === "saved" ? "Title saved" : state.kind === "error" ? state.message : " "}
      </p>
    </div>
  );
}
