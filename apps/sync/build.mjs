// Bundles the server, including the TypeScript workspace packages, into one
// file so the production image needs no node_modules and no TS tooling.
import { build } from "esbuild";

await build({
  entryPoints: { main: "src/main.ts", migrate: "../../packages/db/src/migrate.ts" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  sourcemap: true,
  legalComments: "linked",
  // Some CommonJS dependencies call require() for Node built-ins.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
