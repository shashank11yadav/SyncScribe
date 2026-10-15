import { describe, expect, it } from "vitest";
import { buildCsp, CSP_DIRECTIVES } from "../src/csp";
import { markdownFilename } from "../src/lib/download";
import { createTabIdentity } from "../src/lib/identity";
import { docHref, parseRoute } from "../src/lib/route";
import { shouldAutoSnapshot } from "../src/lib/snapshots";
import { PRESENCE_COLORS } from "@syncscribe/shared/identity";

const ID = "3b241101-e2bb-4255-8caf-4136c566a962";

describe("content security policy", () => {
  const policy = buildCsp();

  it("allows nothing inline, nothing evaluated and no other origin", () => {
    expect(policy).not.toMatch(/unsafe-|https?:|data:|blob:|\*/);
  });

  it("sets the directives a meta policy can carry", () => {
    expect(CSP_DIRECTIVES["default-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["script-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["connect-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["object-src"]).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES["base-uri"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["form-action"]).toEqual(["'none'"]);
    // Ignored (with a console error) when delivered through <meta>.
    expect(policy).not.toMatch(/frame-ancestors|report-uri|sandbox/);
  });
});

describe("routes", () => {
  it("parses list, document and viewer routes", () => {
    expect(parseRoute("")).toEqual({ name: "list" });
    expect(parseRoute("#/")).toEqual({ name: "list" });
    expect(parseRoute(`#/doc/${ID}`)).toEqual({ name: "doc", docId: ID, role: "owner" });
    expect(parseRoute(`#/doc/${ID.toUpperCase()}/viewer`)).toEqual({ name: "doc", docId: ID, role: "viewer" });
  });

  it("does not accept anything else as a document route", () => {
    for (const hash of ["#/doc/123", `#/doc/${ID}/owner`, `#/doc/${ID}/viewer/x`, "#main", "#/doc/../../x"]) {
      expect(parseRoute(hash)).toEqual({ name: "not-found" });
    }
  });

  it("round-trips links", () => {
    expect(parseRoute(docHref(ID))).toEqual({ name: "doc", docId: ID, role: "owner" });
    expect(parseRoute(docHref(ID, "viewer"))).toEqual({ name: "doc", docId: ID, role: "viewer" });
  });
});

describe("helpers", () => {
  it("makes safe Markdown filenames", () => {
    expect(markdownFilename("Launch plan: Q3 / Q4")).toBe("launch-plan-q3-q4.md");
    expect(markdownFilename("../../etc/passwd")).toBe("etcpasswd.md");
    expect(markdownFilename("!!!")).toBe("document.md");
  });

  it("gives each tab a guest name and a palette colour", () => {
    const identity = createTabIdentity("seed-1");
    expect(identity.name).toMatch(/^Guest [A-Z][a-z]+$/);
    expect(PRESENCE_COLORS).toContain(identity.color);
    expect(createTabIdentity("seed-1")).toEqual(identity);
  });

  it("only snapshots a tab that has typed since the last interval", () => {
    expect(shouldAutoSnapshot({ dirty: false, lastSavedAt: 0, now: 10 ** 9 })).toBe(false);
    expect(shouldAutoSnapshot({ dirty: true, lastSavedAt: 0, now: 1000 })).toBe(false);
    expect(shouldAutoSnapshot({ dirty: true, lastSavedAt: 0, now: 2 * 60 * 1000 })).toBe(true);
  });
});
