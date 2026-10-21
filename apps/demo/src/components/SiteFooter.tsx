import { CASE_STUDY_URL } from "../links";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-ink-muted">
        <a href={CASE_STUDY_URL} rel="noopener" className="underline underline-offset-2 hover:text-accent">
          By Shashank Yadav · shashankyadav.dev
        </a>
      </div>
    </footer>
  );
}
