export type PreviewRole = "owner" | "viewer";

export type Route =
  | { name: "list" }
  | { name: "doc"; docId: string; role: PreviewRole }
  | { name: "not-found" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const DOC_ROUTE = new RegExp(`^#/doc/(${UUID})(/viewer)?$`, "i");

/**
 * Hash routes, because GitHub Pages serves files and has no rewrite rules:
 * a deep link like /collaborative-editor/doc/123 would be a 404.
 */
export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#" || hash === "#/") return { name: "list" };
  const match = DOC_ROUTE.exec(hash);
  if (match?.[1]) return { name: "doc", docId: match[1].toLowerCase(), role: match[2] ? "viewer" : "owner" };
  return { name: "not-found" };
}

export function docHref(docId: string, role: PreviewRole = "owner"): string {
  return role === "viewer" ? `#/doc/${docId}/viewer` : `#/doc/${docId}`;
}

export const LIST_HREF = "#/";
