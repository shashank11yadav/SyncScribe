"use client";

import { useEffect, useRef, useState } from "react";
import { titleSchema } from "@syncscribe/shared";
import { renameDocument } from "@/server/actions/documents";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const DEBOUNCE_MS = 700;

/**
 * Saves the title only after typing pauses, and only when the value actually
 * changed. The previous version of this app called rename on every click.
 */
export function TitleField({ docId, initialTitle, editable }: { docId: string; initialTitle: string; editable: boolean }) {
  const [value, setValue] = useState(initialTitle);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const lastSaved = useRef(initialTitle);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!editable) {
    return <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{value}</h1>;
  }

  function schedule(next: string) {
    if (timer.current) clearTimeout(timer.current);
    const parsed = titleSchema.safeParse(next);
    if (!parsed.success) {
      setState({ kind: "error", message: parsed.error.issues[0]?.message ?? "Invalid title" });
      return;
    }
    if (parsed.data === lastSaved.current) {
      setState({ kind: "idle" });
      return;
    }
    timer.current = setTimeout(async () => {
      setState({ kind: "saving" });
      const result = await renameDocument({ docId, title: parsed.data });
      if (result.ok) {
        lastSaved.current = result.data.title;
        setState({ kind: "saved" });
      } else {
        setState({ kind: "error", message: result.error });
      }
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
        onChange={(event) => {
          setValue(event.target.value);
          schedule(event.target.value);
        }}
        className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-2xl font-semibold tracking-tight hover:border-line focus:border-line"
        aria-describedby="doc-title-status"
      />
      <p id="doc-title-status" role="status" aria-live="polite" className={`px-1 text-xs ${state.kind === "error" ? "text-danger" : "text-ink-muted"}`}>
        {state.kind === "saving" ? "Saving title…" : state.kind === "saved" ? "Title saved" : state.kind === "error" ? state.message : " "}
      </p>
    </div>
  );
}
