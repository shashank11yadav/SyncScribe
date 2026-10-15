import { createDocument, createUser } from "../../../test/factories";
import { handle, session } from "./state";

export const db = handle.db;

export function signInAs(user: { id: string; name: string | null; email: string | null } | null) {
  session.user = user ? { id: user.id, name: user.name ?? "Test user", email: user.email } : null;
}

/** A document with one member of each role plus an outsider. */
export async function fixture() {
  const owner = await createUser(db, { name: "Olive Owner" });
  const editor = await createUser(db, { name: "Eddie Editor" });
  const viewer = await createUser(db, { name: "Vera Viewer" });
  const stranger = await createUser(db, { name: "Stan Stranger" });
  const doc = await createDocument(
    db,
    [
      { userId: owner.id, role: "owner" },
      { userId: editor.id, role: "editor" },
      { userId: viewer.id, role: "viewer" },
    ],
    "Fixture doc",
  );
  return { owner, editor, viewer, stranger, doc };
}

export function routeContext<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) } as never;
}

export function request(path: string, init: RequestInit & { origin?: string | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", "localhost:5200");
  if (init.origin !== null) headers.set("origin", init.origin ?? "http://localhost:5200");
  return new Request(`http://localhost:5200${path}`, { ...init, headers });
}
