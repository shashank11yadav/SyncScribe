import { describe, expect, it } from "vitest";
import { UpgradeThrottle } from "../src/throttle";

function req(remoteAddress: string, forwardedFor?: string) {
  return { headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {}, socket: { remoteAddress } } as never;
}

describe("UpgradeThrottle", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    let now = 0;
    const throttle = new UpgradeThrottle(3, 60_000, false, () => now);
    expect([1, 2, 3].map(() => throttle.allow("a"))).toEqual([true, true, true]);
    expect(throttle.allow("a")).toBe(false);
    expect(throttle.allow("b")).toBe(true);
    now = 60_001;
    expect(throttle.allow("a")).toBe(true);
  });

  it("ignores X-Forwarded-For unless told to trust a proxy", () => {
    const direct = new UpgradeThrottle(1, 60_000, false);
    expect(direct.clientAddress(req("10.0.0.1", "1.2.3.4"))).toBe("10.0.0.1");
  });

  it("trusts only the entry appended by the proxy", () => {
    const proxied = new UpgradeThrottle(1, 60_000, true);
    // The client can forge the left-hand entries but not the last one.
    expect(proxied.clientAddress(req("10.0.0.1", "6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
    expect(proxied.clientAddress(req("10.0.0.1"))).toBe("10.0.0.1");
  });
});
