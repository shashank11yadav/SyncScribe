"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createDocument } from "@/server/actions/documents";

export function NewDocumentButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createDocument({});
            if (result.ok) router.push(`/documents/${result.data.id}`);
            else setError(result.error);
          })
        }
      >
        <Plus aria-hidden className="size-4" />
        {pending ? "Creating…" : "New document"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
