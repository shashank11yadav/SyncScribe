import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, sessions, users, verificationTokens } from "@syncscribe/db";
import { getDb } from "@/server/db";

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Only a verified address is stored. Pending invites are claimed by matching
 * this email, so an unverified one would let someone claim another person's
 * invite by adding their address to a GitHub account.
 */
async function verifiedGitHubEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "syncscribe", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const emails = (await res.json()) as GitHubEmail[];
  const pick = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  return pick ? pick.email.toLowerCase() : null;
}

function buildAdapter(): Adapter {
  const base = DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });
  const linkAccount = base.linkAccount;
  if (!linkAccount) throw new Error("Drizzle adapter is missing linkAccount");
  return {
    ...base,
    // The app never calls the GitHub API on the user's behalf after sign-in,
    // so there is no reason to keep their OAuth tokens around.
    linkAccount: (account) =>
      linkAccount({ ...account, access_token: undefined, refresh_token: undefined, id_token: undefined }),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: buildAdapter(),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/signin", error: "/signin" },
  providers: [
    GitHub({
      userinfo: {
        url: "https://api.github.com/user",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const token = tokens.access_token ?? "";
          const res = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}`, "User-Agent": "syncscribe", Accept: "application/vnd.github+json" },
          });
          const profile = (await res.json()) as Record<string, unknown>;
          return { ...profile, email: await verifiedGitHubEmail(token) };
        },
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
}));
