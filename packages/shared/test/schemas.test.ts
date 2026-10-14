import { describe, expect, it } from "vitest";
import { changeRoleInput, createDocInput, emailSchema, renameDocInput, shareDocInput } from "../src/schemas";
import { SANDBOX_DOCUMENT, docDocumentName, parseDocumentName } from "../src/document-name";

const docId = "6f1c1c55-3a8e-4b8f-9d7c-2f1f5b7a9e10";

describe("input schemas", () => {
  it("normalises email addresses", () => {
    expect(emailSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects extra keys such as a forged role or user id", () => {
    expect(renameDocInput.safeParse({ docId, title: "x", role: "owner" }).success).toBe(false);
    expect(createDocInput.safeParse({ userId: "someone-else" }).success).toBe(false);
  });

  it("only allows viewer and editor when sharing", () => {
    expect(shareDocInput.safeParse({ docId, email: "a@b.co", role: "owner" }).success).toBe(false);
    expect(shareDocInput.safeParse({ docId, email: "a@b.co", role: "editor" }).success).toBe(true);
    expect(changeRoleInput.safeParse({ docId, userId: "u", role: "owner" }).success).toBe(false);
  });

  it("trims titles and enforces length", () => {
    expect(renameDocInput.parse({ docId, title: "  Plan  " }).title).toBe("Plan");
    expect(renameDocInput.safeParse({ docId, title: "   " }).success).toBe(false);
    expect(renameDocInput.safeParse({ docId, title: "x".repeat(121) }).success).toBe(false);
  });

  it("rejects non-uuid document ids", () => {
    expect(renameDocInput.safeParse({ docId: "../../etc/passwd", title: "x" }).success).toBe(false);
  });
});

describe("document names", () => {
  it("round-trips document ids", () => {
    expect(parseDocumentName(docDocumentName(docId))).toEqual({ kind: "doc", docId });
  });

  it("recognises the sandbox", () => {
    expect(parseDocumentName(SANDBOX_DOCUMENT)).toEqual({ kind: "sandbox", slot: "lobby" });
  });

  it("rejects anything else", () => {
    expect(parseDocumentName("doc:not-a-uuid")).toBeNull();
    expect(parseDocumentName("sandbox:../x")).toBeNull();
    expect(parseDocumentName(docId)).toBeNull();
  });
});
