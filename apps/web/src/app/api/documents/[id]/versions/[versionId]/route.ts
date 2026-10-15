import { z } from "zod";
import { requireDocAccess } from "@/server/access";
import { handle, json } from "@/server/http";
import { getVersionState } from "@/server/queries";
import { stateToProseMirror } from "@/server/ydoc";

export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/versions/[versionId]">) {
  return handle(async () => {
    const { id, versionId } = await ctx.params;
    const { docId } = await requireDocAccess(id, "doc.history");
    const parsedVersion = z.uuid().safeParse(versionId);
    if (!parsedVersion.success) return json({ error: "not_found" }, { status: 404 });
    const state = await getVersionState(docId, parsedVersion.data);
    if (!state) return json({ error: "not_found" }, { status: 404 });
    return json({ content: stateToProseMirror(state) });
  });
}
