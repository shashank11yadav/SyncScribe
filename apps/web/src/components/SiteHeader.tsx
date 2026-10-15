import Link from "next/link";
import { signOut } from "@/auth";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClasses } from "@/components/ui/Button";
import { currentUser } from "@/server/session";

export async function SiteHeader() {
  const user = await currentUser();

  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="SyncScribe home" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span className="hidden sm:inline">SyncScribe</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm whitespace-nowrap">
          <Link href="/sandbox" className="rounded-md px-2.5 py-2 hover:bg-surface-muted">
            Sandbox
          </Link>
          {user ? (
            <>
              <Link href="/documents" className="rounded-md px-2.5 py-2 hover:bg-surface-muted">
                Documents
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
                className="ml-1 flex items-center gap-2"
              >
                <span className="hidden sm:inline-flex" title={user.name ?? user.email ?? "Signed in"}>
                  <Avatar name={user.name ?? "?"} image={user.image} size={28} />
                </span>
                <button type="submit" className={buttonClasses("ghost", "min-h-9 px-2.5")}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/signin" className={buttonClasses("primary", "ml-1 min-h-9")}>
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
