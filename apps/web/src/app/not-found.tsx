import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="mt-3 text-ink-muted">
        This page does not exist, or it is a document you do not have access to.
      </p>
      <Link href="/documents" className={buttonClasses("primary", "mt-8")}>
        Back to your documents
      </Link>
    </div>
  );
}
