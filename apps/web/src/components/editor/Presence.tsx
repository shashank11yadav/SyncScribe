import { WebSocketStatus } from "@hocuspocus/provider";
import { Avatar } from "@/components/ui/Avatar";
import type { PeerPresence } from "./useCollaboration";

const STATUS_TEXT: Record<WebSocketStatus, string> = {
  [WebSocketStatus.Connected]: "Live",
  [WebSocketStatus.Connecting]: "Connecting",
  [WebSocketStatus.Disconnected]: "Offline, reconnecting",
};

export function Presence({ peers, status, synced }: { peers: PeerPresence[]; status: WebSocketStatus; synced: boolean }) {
  const live = status === WebSocketStatus.Connected && synced;
  const shown = peers.slice(0, 5);
  const others = peers.length - shown.length;
  return (
    <div className="flex items-center gap-3">
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
      <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <span aria-hidden className={`size-2 rounded-full ${live ? "bg-accent" : "bg-ink-muted"}`} />
        {live ? STATUS_TEXT[WebSocketStatus.Connected] : STATUS_TEXT[status]}
      </p>
    </div>
  );
}
