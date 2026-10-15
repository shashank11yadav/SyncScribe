import { describe, expect, it } from "vitest";
import { peerFromState, peersFromStates } from "../src/presence";

describe("peerFromState", () => {
  it("accepts a well-formed user", () => {
    expect(peerFromState(7, { user: { name: "Ada", color: "#027a48" } })).toEqual({ clientId: 7, name: "Ada", color: "#027a48" });
  });

  it("ignores states without a usable name", () => {
    expect(peerFromState(1, null)).toBeNull();
    expect(peerFromState(1, "user")).toBeNull();
    expect(peerFromState(1, { user: null })).toBeNull();
    expect(peerFromState(1, { user: { name: 42, color: "#027a48" } })).toBeNull();
    expect(peerFromState(1, { user: { name: "   ", color: "#027a48" } })).toBeNull();
  });

  it("replaces colours that are not plain hex", () => {
    for (const color of ["red", "#fff", "url(javascript:alert(1))", "#027a48; background: red", 12]) {
      expect(peerFromState(1, { user: { name: "Ada", color } })?.color).toBe("#57534e");
    }
  });

  it("trims and caps long names", () => {
    const peer = peerFromState(1, { user: { name: `  ${"x".repeat(200)}  `, color: "#027a48" } });
    expect(peer?.name).toHaveLength(80);
  });
});

describe("peersFromStates", () => {
  it("skips this client and invalid states, sorted by client id", () => {
    const peers = peersFromStates(
      [
        [9, { user: { name: "Grace", color: "#b42318" } }],
        [3, { user: { name: "Me", color: "#b42318" } }],
        [5, { cursor: {} }],
        [4, { user: { name: "Ada", color: "#027a48" } }],
      ],
      3,
    );
    expect(peers.map((p) => p.name)).toEqual(["Ada", "Grace"]);
  });
});
