import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { buttonClasses } from "@syncscribe/editor";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { currentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That GitHub account is linked to a different user.",
  AccessDenied: "GitHub sign-in was cancelled.",
  Configuration: "Sign-in is not configured on this server yet.",
};

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.callbackUrl);
  if (await currentUser()) redirect(next as "/documents");

  const errorKey = typeof params.error === "string" ? params.error : null;
  const error = errorKey ? (ERRORS[errorKey] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <h1 className="text-2xl font-semibold">Sign in to SyncScribe</h1>
      <p className="mt-2 text-ink-muted">
        We use your GitHub name, avatar and verified email. We do not keep your GitHub access token.
      </p>
      {error ? (
        <p role="alert" className="mt-6 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <form
        className="mt-8"
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: next });
        }}
      >
        <button type="submit" className={buttonClasses("primary", "min-h-11 w-full text-base")}>
          <svg aria-hidden viewBox="0 0 16 16" className="size-5 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Continue with GitHub
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        Just looking?{" "}
        <Link href="/sandbox" className="font-medium text-accent underline">
          Try the sandbox
        </Link>{" "}
        without an account.
      </p>
    </div>
  );
}
