import { requireDocAccess } from "@/server/access";
import { handle, json } from "@/server/http";
import { listVersions } from "@/server/queries";

export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/versions">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { docId } = await requireDocAccess(id, "doc.history");
    return json({ versions: await listVersions(docId) });
  });
}
