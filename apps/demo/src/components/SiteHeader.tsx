import { REPO_URL } from "../links";
import { LIST_HREF } from "../lib/route";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <a href={LIST_HREF} aria-label="SyncScribe demo, your documents" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={24} height={24} />
          <span>SyncScribe</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-muted">Demo</span>
        </a>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm whitespace-nowrap">
          {/* The logo already links to the list, so phones drop this link to keep the header within 375px. */}
          <a href={LIST_HREF} className="hidden rounded-md px-2.5 py-2 hover:bg-surface-muted sm:inline-block">
            Documents
          </a>
          <a href={REPO_URL} className="rounded-md px-2 py-2 hover:bg-surface-muted sm:px-2.5">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
