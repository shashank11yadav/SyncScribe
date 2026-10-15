import type { IncomingMessage } from "node:http";

/**
 * Sliding-window limit on websocket upgrades per client address. Runs before
 * the upgrade completes, so a flood never reaches the token check or Postgres.
 *
 * The stock Hocuspocus throttle keys on X-Forwarded-For alone, which puts
 * every direct client in one shared bucket and lets a client pick its own
 * key. Here the socket address is used unless the server is told it sits
 * behind a proxy, and then only the entry the proxy appended is trusted.
 */
export class UpgradeThrottle {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly trustProxy: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  clientAddress(request: Pick<IncomingMessage, "headers" | "socket">): string {
    if (this.trustProxy) {
      const header = request.headers["x-forwarded-for"];
      const value = Array.isArray(header) ? header.join(",") : header;
      const last = value?.split(",").map((part) => part.trim()).filter(Boolean).pop();
      if (last) return last;
    }
    return request.socket.remoteAddress ?? "unknown";
  }

  /** Records an attempt and returns false when the address is over its limit. */
  allow(address: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(address) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(address, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(address, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [address, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(address);
    }
  }
}
