import { WebSocketStatus } from "@hocuspocus/provider";
import { PeerAvatars, type PeerPresence } from "@syncscribe/editor";

const STATUS_TEXT: Record<WebSocketStatus, string> = {
  [WebSocketStatus.Connected]: "Live",
  [WebSocketStatus.Connecting]: "Connecting",
  [WebSocketStatus.Disconnected]: "Offline, reconnecting",
};

export function Presence({ peers, status, synced }: { peers: PeerPresence[]; status: WebSocketStatus; synced: boolean }) {
  const live = status === WebSocketStatus.Connected && synced;
  return (
    <div className="flex items-center gap-3">
      <PeerAvatars peers={peers} />
      <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <span aria-hidden className={`size-2 rounded-full ${live ? "bg-accent" : "bg-ink-muted"}`} />
        {live ? STATUS_TEXT[WebSocketStatus.Connected] : STATUS_TEXT[status]}
      </p>
    </div>
  );
}
