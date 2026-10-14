/**
 * Serialises the ProseMirror JSON produced by the editor into CommonMark.
 * Written by hand rather than pulled in as a dependency because the node set
 * is small and the inline mark handling is where most converters go wrong.
 */

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

type InlineMark = { key: string; open: string; close: string };

const SAFE_LINK = /^(https?:|mailto:)/i;

function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]<>~|])/g, "\\$1");
}

/** Characters that would turn the start of a paragraph into another block type. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+-])/, "$1\\$2")
    .replace(/^(\s*\d+)([.)])/, "$1\\$2");
}

function formatHref(href: string): string {
  return /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href;
}

function toInlineMark(mark: PMMark): InlineMark | null {
  switch (mark.type) {
    case "bold":
      return { key: "bold", open: "**", close: "**" };
    case "italic":
      return { key: "italic", open: "_", close: "_" };
    case "strike":
      return { key: "strike", open: "~~", close: "~~" };
    case "link": {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href.trim() : "";
      if (!SAFE_LINK.test(href)) return null;
      return { key: `link:${href}`, open: "[", close: `](${formatHref(href)})` };
    }
    default:
      return null;
  }
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function serializeInline(nodes: PMNode[]): string {
  let out = "";
  let pendingSpace = "";
  const active: InlineMark[] = [];

  const closeFrom = (index: number) => {
    while (active.length > index) out += active.pop()!.close;
  };

  for (const node of nodes) {
    if (node.type === "hardBreak") {
      closeFrom(0);
      out += pendingSpace + "\\\n";
      pendingSpace = "";
      continue;
    }
    if (node.type !== "text" || !node.text) continue;

    const marks = (node.marks ?? []).map(toInlineMark).filter((m): m is InlineMark => m !== null);
    const isCode = (node.marks ?? []).some((m) => m.type === "code");

    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text);
    const [, lead = "", core = "", trail = ""] = match ?? [];
    if (!core) {
      pendingSpace += node.text;
      continue;
    }

    // Keep the longest run of marks that is still open, close the rest.
    let keep = 0;
    while (keep < active.length && marks.some((m) => m.key === active[keep]!.key)) keep++;
    closeFrom(keep);

    out += pendingSpace + lead;
    pendingSpace = trail;

    for (const mark of marks) {
      if (!active.some((m) => m.key === mark.key)) {
        out += mark.open;
        active.push(mark);
      }
    }
    out += isCode ? codeSpan(core) : escapeText(core);
  }

  closeFrom(0);
  return out + pendingSpace;
}

function indent(text: string, prefix: string, first: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? first + line : line ? prefix + line : line))
    .join("\n");
}

function serializeBlocks(nodes: PMNode[] | undefined, separator = "\n\n"): string {
  return (nodes ?? [])
    .map(serializeBlock)
    .filter((block) => block !== null)
    .join(separator);
}

function serializeList(node: PMNode, ordered: boolean): string {
  const start = ordered && typeof node.attrs?.start === "number" ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : "- ";
      const body = serializeBlocks(item.content) || "";
      return indent(body, " ".repeat(marker.length), marker);
    })
    .join("\n");
}

function serializeBlock(node: PMNode): string | null {
  switch (node.type) {
    case "paragraph":
      return escapeLineStart(serializeInline(node.content ?? []));
    case "heading": {
      const raw = Number(node.attrs?.level ?? 1);
      const level = Math.min(6, Math.max(1, Number.isFinite(raw) ? raw : 1));
      return `${"#".repeat(level)} ${serializeInline(node.content ?? [])}`;
    }
    case "blockquote":
      return serializeBlocks(node.content)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "bulletList":
      return serializeList(node, false);
    case "orderedList":
      return serializeList(node, true);
    case "codeBlock": {
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      const language = typeof node.attrs?.language === "string" ? node.attrs.language.replace(/[^\w+-]/g, "") : "";
      const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
      const fence = "`".repeat(longest + 1);
      return `${fence}${language}\n${text}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "text":
      return escapeText(node.text ?? "");
    default:
      return node.content ? serializeBlocks(node.content) : null;
  }
}

export function toMarkdown(doc: PMNode, title?: string): string {
  const body = serializeBlocks(doc.content);
  const heading = title ? `# ${escapeText(title)}\n\n` : "";
  return `${heading}${body}`.trimEnd() + "\n";
}
