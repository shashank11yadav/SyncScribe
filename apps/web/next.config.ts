import path from "node:path";
import type { NextConfig } from "next";

// Local scripts load the repository-root .env through NODE_OPTIONS (see package.json).
const workspaceRoot = path.resolve(process.cwd(), "../..");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  agentRules: false,
  transpilePackages: ["@syncscribe/shared", "@syncscribe/db"],
  // One Yjs instance per server process; bundling it into each route creates
  // copies that fail Yjs's constructor checks.
  serverExternalPackages: ["yjs"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
