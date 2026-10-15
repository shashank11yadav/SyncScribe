import { Avatar } from "./ui/Avatar";
import type { PeerPresence } from "./presence";

export function PeerAvatars({ peers, max = 5 }: { peers: PeerPresence[]; max?: number }) {
  const shown = peers.slice(0, max);
  const others = peers.length - shown.length;
  return (
    <ul aria-label={`${peers.length} other ${peers.length === 1 ? "person" : "people"} here`} className="flex -space-x-2">
      {shown.map((peer) => (
        <li key={peer.clientId} title={peer.name} className="rounded-full ring-2 ring-paper">
          <Avatar name={peer.name} color={peer.color} size={28} />
          <span className="sr-only">{peer.name}</span>
        </li>
      ))}
      {others > 0 ? (
        <li className="inline-flex size-7 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold ring-2 ring-paper">
          +{others}
        </li>
      ) : null}
    </ul>
  );
}
