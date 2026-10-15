import type { Role } from "@syncscribe/shared";

const LABELS: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "View only" };

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
      {LABELS[role]}
    </span>
  );
}
