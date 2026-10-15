import { colorFor, displayName, docDocumentName, signSyncToken } from "@syncscribe/shared";
import { requireDocAccess } from "@/server/access";
import { serverEnv } from "@/server/env";
import { assertSameOrigin, handle, json } from "@/server/http";

/**
 * Mints the websocket token. Role and identity come from the session and the
 * membership table; the request body is ignored entirely.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/token">) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await ctx.params;
    const { user, role, docId } = await requireDocAccess(id, "doc.read");
    const token = await signSyncToken(
      {
        sub: user.id,
        kind: "user",
        doc: docDocumentName(docId),
        role,
        name: displayName(user.name, user.email?.split("@")[0] ?? "Member"),
        color: colorFor(user.id),
      },
      serverEnv().SYNC_TOKEN_SECRET,
    );
    return json({ token, role });
  });
}
