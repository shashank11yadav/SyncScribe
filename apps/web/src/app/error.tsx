"use client";

import { Button } from "@/components/ui/Button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-ink-muted">The page failed to load. Your documents are safe.</p>
      <Button variant="primary" className="mt-8" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
