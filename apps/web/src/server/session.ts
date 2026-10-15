import "server-only";
import { auth } from "@/auth";
import { AccessError } from "./errors";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, name: user.name ?? null, email: user.email ?? null, image: user.image ?? null };
}

/** The only place identity comes from: the server-side session, never the request body. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AccessError("unauthenticated");
  return user;
}
