import { toMarkdown, type PMNode } from "@syncscribe/shared/markdown";

export function markdownFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60);
  return `${slug || "document"}.md`;
}

/** Same serializer the full app's export route uses, run in the page. */
export function downloadMarkdown(json: PMNode, title: string): void {
  const blob = new Blob([toMarkdown(json, title)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = markdownFilename(title);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next task: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
