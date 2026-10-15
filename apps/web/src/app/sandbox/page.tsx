import type { Metadata } from "next";
import { SandboxEditor } from "@/components/editor/SandboxEditor";

export const metadata: Metadata = {
  title: "Sandbox",
  description: "A public SyncScribe document anyone can edit without signing in.",
};

export default function SandboxPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Public sandbox</h1>
        <p className="mt-2 text-ink-muted">
          Anyone with this link edits the same page. It is kept apart from real documents and resets every 30
          minutes, so please do not type anything private.
        </p>
      </div>
      <SandboxEditor syncUrl={process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:5201"} />
    </div>
  );
}
