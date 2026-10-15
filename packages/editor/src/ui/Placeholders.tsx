import type { ReactNode } from "react";

export function EditorSkeleton() {
  return (
    <div aria-hidden className="min-h-[55vh] animate-pulse rounded-xl border border-line bg-surface p-8">
      <div className="h-6 w-1/3 rounded bg-surface-muted" />
      <div className="mt-6 h-4 w-5/6 rounded bg-surface-muted" />
      <div className="mt-3 h-4 w-2/3 rounded bg-surface-muted" />
    </div>
  );
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted">{children}</p>;
}
