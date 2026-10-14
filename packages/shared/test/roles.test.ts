import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ROLES,
  can,
  canChangeRole,
  canGrant,
  canRemoveMember,
  canTransferTo,
  lowerRole,
  roleAtLeast,
  type Action,
  type Role,
} from "../src/roles";

// The expected matrix is written out by hand on purpose: if someone edits
// ACTIONS, this table has to be edited too, which makes the change visible
// in review.
const EXPECTED: Record<Action, Record<Role, boolean>> = {
  "doc.read": { viewer: true, editor: true, owner: true },
  "doc.export": { viewer: true, editor: true, owner: true },
  "doc.listMembers": { viewer: true, editor: true, owner: true },
  "doc.leave": { viewer: true, editor: true, owner: true },
  "doc.edit": { viewer: false, editor: true, owner: true },
  "doc.rename": { viewer: false, editor: true, owner: true },
  "doc.share": { viewer: false, editor: true, owner: true },
  "doc.viewInvites": { viewer: false, editor: true, owner: true },
  "doc.history": { viewer: false, editor: true, owner: true },
  "doc.snapshot": { viewer: false, editor: true, owner: true },
  "doc.restore": { viewer: false, editor: true, owner: true },
  "doc.changeRole": { viewer: false, editor: false, owner: true },
  "doc.removeMember": { viewer: false, editor: false, owner: true },
  "doc.revokeInvite": { viewer: false, editor: false, owner: true },
  "doc.transfer": { viewer: false, editor: false, owner: true },
  "doc.delete": { viewer: false, editor: false, owner: true },
};

describe("permission matrix", () => {
  it("covers every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(ACTIONS).sort());
  });

  for (const action of Object.keys(EXPECTED) as Action[]) {
    for (const role of ROLES) {
      it(`${role} ${EXPECTED[action][role] ? "can" : "cannot"} ${action}`, () => {
        expect(can(role, action)).toBe(EXPECTED[action][role]);
      });
    }
    it(`a stranger cannot ${action}`, () => {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    });
  }
});

describe("roleAtLeast and lowerRole", () => {
  it("orders roles viewer < editor < owner", () => {
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("editor", "owner")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast(null, "viewer")).toBe(false);
  });

  it("picks the weaker role", () => {
    expect(lowerRole("owner", "viewer")).toBe("viewer");
    expect(lowerRole("editor", "owner")).toBe("editor");
    expect(lowerRole("editor", "editor")).toBe("editor");
  });

  it("ignores roles that are not in the enum", () => {
    expect(roleAtLeast("admin" as Role, "viewer")).toBe(false);
  });
});

describe("canGrant", () => {
  it("lets owners and editors grant viewer and editor", () => {
    for (const actor of ["owner", "editor"] as const) {
      expect(canGrant(actor, "viewer")).toBe(true);
      expect(canGrant(actor, "editor")).toBe(true);
    }
  });

  it("never grants owner through sharing", () => {
    for (const actor of ROLES) expect(canGrant(actor, "owner")).toBe(false);
  });

  it("refuses viewers and strangers", () => {
    expect(canGrant("viewer", "viewer")).toBe(false);
    expect(canGrant(null, "viewer")).toBe(false);
  });
});

describe("canChangeRole", () => {
  it("is owner only", () => {
    expect(canChangeRole("owner", "viewer", "editor")).toBe(true);
    expect(canChangeRole("owner", "editor", "viewer")).toBe(true);
    expect(canChangeRole("editor", "viewer", "editor")).toBe(false);
    expect(canChangeRole("viewer", "viewer", "editor")).toBe(false);
  });

  it("cannot touch the owner or create one", () => {
    expect(canChangeRole("owner", "owner", "editor")).toBe(false);
    expect(canChangeRole("owner", "editor", "owner")).toBe(false);
  });
});

describe("canRemoveMember", () => {
  const owner = { id: "o", role: "owner" as const };
  const editor = { id: "e", role: "editor" as const };
  const viewer = { id: "v", role: "viewer" as const };

  it("lets the owner remove editors and viewers", () => {
    expect(canRemoveMember(owner, editor)).toBe(true);
    expect(canRemoveMember(owner, viewer)).toBe(true);
  });

  it("lets anyone but the owner leave", () => {
    expect(canRemoveMember(editor, editor)).toBe(true);
    expect(canRemoveMember(viewer, viewer)).toBe(true);
    expect(canRemoveMember(owner, owner)).toBe(false);
  });

  it("stops editors and viewers removing other people", () => {
    expect(canRemoveMember(editor, viewer)).toBe(false);
    expect(canRemoveMember(viewer, editor)).toBe(false);
    expect(canRemoveMember(editor, owner)).toBe(false);
  });

  it("refuses strangers", () => {
    expect(canRemoveMember({ id: "x", role: null }, viewer)).toBe(false);
  });
});

describe("canTransferTo", () => {
  it("only the owner can transfer, and only to an existing member", () => {
    expect(canTransferTo("owner", "editor")).toBe(true);
    expect(canTransferTo("owner", "viewer")).toBe(true);
    expect(canTransferTo("owner", null)).toBe(false);
    expect(canTransferTo("owner", "owner")).toBe(false);
    expect(canTransferTo("editor", "viewer")).toBe(false);
  });
});
