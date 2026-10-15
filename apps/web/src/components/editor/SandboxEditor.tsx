"use client";

import { ExternalLink } from "lucide-react";
import { useCallback } from "react";
import { SANDBOX_DOCUMENT } from "@syncscribe/shared";
import { Button } from "@/components/ui/Button";
import { CollaborativeEditor } from "./CollaborativeEditor";
import { TokenRequestError } from "./useCollaboration";

export function SandboxEditor({ syncUrl }: { syncUrl: string }) {
  const fetchToken = useCallback(async () => {
    const res = await fetch("/api/sandbox/token", { method: "POST" });
    if (!res.ok) throw new TokenRequestError(res.status);
    const body = (await res.json()) as { token: string };
    return body.token;
  }, []);

  return (
    <CollaborativeEditor
      syncUrl={syncUrl}
      documentName={SANDBOX_DOCUMENT}
      fetchToken={fetchToken}
      label="Sandbox document"
      aside={
        <Button
          variant="secondary"
          onClick={() => window.open(window.location.href, "_blank", "noopener,width=900,height=800")}
        >
          <ExternalLink aria-hidden className="size-4" />
          Open a second window
        </Button>
      }
      lostAccess={
        <p role="alert" className="rounded-md border border-line bg-surface px-4 py-3">
          The sandbox is busy right now. Wait a minute and reload the page.
        </p>
      }
    />
  );
}
