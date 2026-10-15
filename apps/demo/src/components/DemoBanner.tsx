import { useDemo } from "../demo-context";
import { REPO_URL, RUN_LOCALLY_URL } from "../links";

/** Always shown. The demo should never be mistaken for the deployed full app. */
export function DemoBanner() {
  const { persistent } = useDemo();
  return (
    <aside aria-label="About this demo" className="border-b border-line bg-accent-soft">
      <div className="mx-auto max-w-6xl px-4 py-2.5 text-sm leading-relaxed">
        <p>
          <strong className="font-semibold">Static demo.</strong> Everything runs in your browser and syncs between your
          own tabs. Sign-in, sharing and server-enforced permissions are in the full app.{" "}
          <a href={RUN_LOCALLY_URL} className="font-medium text-accent underline underline-offset-2">
            Run it locally →
          </a>{" "}
          <span aria-hidden>·</span>{" "}
          <a href={REPO_URL} className="font-medium text-accent underline underline-offset-2">
            Source on GitHub
          </a>
        </p>
        {persistent ? null : (
          <p className="mt-1 font-medium text-danger">
            This browser is blocking site storage, so documents will be lost when you close the tab.
          </p>
        )}
      </div>
    </aside>
  );
}
