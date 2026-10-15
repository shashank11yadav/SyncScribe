import { describe, expect, it } from "vitest";
import { splitOuterWhitespace, toMarkdown, type PMNode } from "../src/markdown";

const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });
const p = (...content: PMNode[]): PMNode => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]): PMNode => ({ type: "text", text, marks: marks.map((type) => ({ type })) });

describe("toMarkdown", () => {
  it("writes headings, paragraphs and rules", () => {
    const md = toMarkdown(
      doc({ type: "heading", attrs: { level: 2 }, content: [t("Plan")] }, p(t("First line")), { type: "horizontalRule" }),
    );
    expect(md).toBe("## Plan\n\nFirst line\n\n---\n");
  });

  it("nests overlapping marks without breaking emphasis", () => {
    const md = toMarkdown(doc(p(t("Hello ", "bold"), t("world", "bold", "italic"), t("!"))));
    expect(md).toBe("**Hello _world_**!\n");
  });

  it("keeps spaces outside emphasis markers", () => {
    expect(toMarkdown(doc(p(t("a"), t(" bold ", "bold"), t("b"))))).toBe("a **bold** b\n");
  });

  it("escapes characters that would become markup", () => {
    expect(toMarkdown(doc(p(t("2 * 3 = _six_ [x]"))))).toBe("2 \\* 3 = \\_six\\_ \\[x\\]\n");
    expect(toMarkdown(doc(p(t("# not a heading"))))).toBe("\\# not a heading\n");
    expect(toMarkdown(doc(p(t("1. not a list"))))).toBe("1\\. not a list\n");
  });

  it("writes inline code with a fence longer than its content", () => {
    expect(toMarkdown(doc(p(t("a`b", "code"))))).toBe("``a`b``\n");
  });

  it("writes safe links and drops unsafe ones", () => {
    const link = (href: string): PMNode => ({ type: "text", text: "site", marks: [{ type: "link", attrs: { href } }] });
    expect(toMarkdown(doc(p(link("https://example.com"))))).toBe("[site](https://example.com)\n");
    expect(toMarkdown(doc(p(link("javascript:alert(1)"))))).toBe("site\n");
  });

  it("writes nested and ordered lists", () => {
    const li = (...content: PMNode[]): PMNode => ({ type: "listItem", content });
    const md = toMarkdown(
      doc(
        { type: "bulletList", content: [li(p(t("one")), { type: "bulletList", content: [li(p(t("inner")))] }), li(p(t("two")))] },
        { type: "orderedList", attrs: { start: 3 }, content: [li(p(t("three"))), li(p(t("four")))] },
      ),
    );
    expect(md).toBe("- one\n\n  - inner\n- two\n\n3. three\n4. four\n");
  });

  it("writes blockquotes and code blocks", () => {
    const md = toMarkdown(
      doc(
        { type: "blockquote", content: [p(t("quoted")), p(t("twice"))] },
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const a = 1;\n```" }] },
      ),
    );
    expect(md).toBe("> quoted\n>\n> twice\n\n````ts\nconst a = 1;\n```\n````\n");
  });

  it("handles hard breaks and an optional title", () => {
    expect(toMarkdown(doc(p(t("a"), { type: "hardBreak" }, t("b"))), "Notes")).toBe("# Notes\n\na\\\nb\n");
  });

  it("returns a single newline for an empty document", () => {
    expect(toMarkdown(doc())).toBe("\n");
  });
});

describe("splitOuterWhitespace", () => {
  it("splits leading and trailing whitespace from the core", () => {
    expect(splitOuterWhitespace("  two words \t")).toEqual({ lead: "  ", core: "two words", trail: " \t" });
    expect(splitOuterWhitespace("bare")).toEqual({ lead: "", core: "bare", trail: "" });
    expect(splitOuterWhitespace("   ")).toEqual({ lead: "   ", core: "", trail: "" });
    expect(splitOuterWhitespace("")).toEqual({ lead: "", core: "", trail: "" });
  });

  it("stays linear on long runs of spaces", () => {
    const spaces = " ".repeat(100_000);
    const started = performance.now();
    const parts = splitOuterWhitespace(`${spaces}x${spaces}y${spaces}`);
    expect(performance.now() - started).toBeLessThan(500);
    expect(parts.core).toBe(`x${spaces}y`);
    expect(parts.lead.length + parts.trail.length).toBe(200_000);
  });
});
