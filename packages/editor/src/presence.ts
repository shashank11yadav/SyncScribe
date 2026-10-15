import { displayName } from "@syncscribe/shared";

export interface PeerPresence {
  clientId: number;
  name: string;
  color: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#57534e";

/**
 * Awareness states arrive from other clients, so they are treated as untrusted
 * JSON. Anything without a string name is ignored; a bad colour is replaced
 * rather than passed into a style.
 */
export function peerFromState(clientId: number, state: unknown): PeerPresence | null {
  if (!state || typeof state !== "object") return null;
  const user = (state as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const { name, color } = user as { name?: unknown; color?: unknown };
  if (typeof name !== "string" || !name.trim()) return null;
  return {
    clientId,
    name: displayName(name, "Someone"),
    color: typeof color === "string" && HEX_COLOR.test(color) ? color : FALLBACK_COLOR,
  };
}

/** Everyone in the document except this client, in a stable order. */
export function peersFromStates(states: Iterable<[number, unknown]>, selfId: number): PeerPresence[] {
  const peers: PeerPresence[] = [];
  for (const [clientId, state] of states) {
    if (clientId === selfId) continue;
    const peer = peerFromState(clientId, state);
    if (peer) peers.push(peer);
  }
  return peers.sort((a, b) => a.clientId - b.clientId);
}
