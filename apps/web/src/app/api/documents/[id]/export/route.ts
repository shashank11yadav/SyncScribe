import { toMarkdown } from "@syncscribe/shared/markdown";
import { requireDocAccess } from "@/server/access";
import { handle } from "@/server/http";
import { getDocumentMeta, getDocumentState } from "@/server/queries";
import { stateToProseMirror } from "@/server/ydoc";

function filenameFor(title: string): string {
  const base = title.normalize("NFKD").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return `${base || "document"}.md`;
}

/** Exports the last persisted state, which trails live edits by a couple of seconds at most. */
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/export">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { docId } = await requireDocAccess(id, "doc.export");
    const [meta, state] = await Promise.all([getDocumentMeta(docId), getDocumentState(docId)]);
    const markdown = toMarkdown(stateToProseMirror(state), meta?.title);
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameFor(meta?.title ?? "document")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
