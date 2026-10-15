import { History, KeyRound, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { currentUser } from "@/server/session";

const FEATURES = [
  {
    icon: Radio,
    title: "Live, conflict-free editing",
    body: "Yjs merges every keystroke, so two people typing in the same sentence never overwrite each other. Cursors carry names.",
  },
  {
    icon: KeyRound,
    title: "Owner, editor, viewer",
    body: "Roles are checked on every request and again by the sync server. Viewers get a read-only socket, not just a disabled button.",
  },
  {
    icon: History,
    title: "Version history",
    body: "Snapshots are taken while you write. Preview any of them and restore it without losing what came after.",
  },
  {
    icon: ShieldCheck,
    title: "Runs on your own sync server",
    body: "Documents live in your Postgres, synced through a small Hocuspocus server you deploy yourself.",
  },
];

export default async function HomePage() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-16 sm:py-24">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">Real-time collaborative documents</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Write together, see each other type, and keep control of who can change what.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-muted">
          SyncScribe is a shared editor with GitHub sign-in, role-based sharing, version history and Markdown export.
          The public sandbox needs no account.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sandbox" className={buttonClasses("primary", "min-h-11 px-5 text-base")}>
            Try the sandbox, no sign-in
          </Link>
          <Link
            href={user ? "/documents" : "/signin"}
            className={buttonClasses("secondary", "min-h-11 px-5 text-base")}
          >
            {user ? "Open your documents" : "Sign in with GitHub"}
          </Link>
        </div>
      </section>

      <section aria-labelledby="features-heading" className="border-t border-line py-14">
        <h2 id="features-heading" className="sr-only">
          Features
        </h2>
        <ul className="grid gap-8 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-ink-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
