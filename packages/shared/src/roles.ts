/**
 * The single source of truth for what each role may do. Both the web app and
 * the sync server import from here so the two can never disagree about who is
 * allowed to write.
 */

export const ROLES = ["viewer", "editor", "owner"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be handed out through sharing. Ownership only moves by transfer. */
export const SHARE_ROLES = ["viewer", "editor"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

export const ACTIONS = {
  "doc.read": "viewer",
  "doc.export": "viewer",
  "doc.listMembers": "viewer",
  "doc.leave": "viewer",
  "doc.edit": "editor",
  "doc.rename": "editor",
  "doc.share": "editor",
  "doc.viewInvites": "editor",
  "doc.history": "editor",
  "doc.snapshot": "editor",
  "doc.restore": "editor",
  "doc.changeRole": "owner",
  "doc.removeMember": "owner",
  "doc.revokeInvite": "owner",
  "doc.transfer": "owner",
  "doc.delete": "owner",
} as const satisfies Record<string, Role>;

export type Action = keyof typeof ACTIONS;

export function can(role: Role | null | undefined, action: Action): boolean {
  return roleAtLeast(role, ACTIONS[action]);
}

/**
 * Editors may bring people in, but never above their own level, and nobody can
 * mint a second owner through the share dialog.
 */
export function canGrant(actor: Role | null | undefined, granted: Role): boolean {
  if (!can(actor, "doc.share")) return false;
  if (granted === "owner") return false;
  return roleAtLeast(actor, granted);
}

/**
 * Changing an existing member's role is owner-only. Editors could otherwise
 * demote each other in a loop, and the owner's role must only change through
 * an explicit transfer.
 */
export function canChangeRole(
  actor: Role | null | undefined,
  target: Role,
  next: Role,
): boolean {
  if (!can(actor, "doc.changeRole")) return false;
  return target !== "owner" && next !== "owner";
}

/** Owners remove anyone but themselves; everyone else may only remove themselves. */
export function canRemoveMember(
  actor: { id: string; role: Role | null | undefined },
  target: { id: string; role: Role },
): boolean {
  if (!actor.role) return false;
  if (target.role === "owner") return false;
  if (actor.id === target.id) return can(actor.role, "doc.leave");
  return can(actor.role, "doc.removeMember");
}

/** Ownership can only be handed to someone who is already a member. */
export function canTransferTo(
  actor: Role | null | undefined,
  target: Role | null | undefined,
): boolean {
  return can(actor, "doc.transfer") && (target === "editor" || target === "viewer");
}

/** The weaker of two roles. Used where two sources must both agree. */
export function lowerRole(a: Role, b: Role): Role {
  return RANK[a] <= RANK[b] ? a : b;
}
