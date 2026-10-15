import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          root: "packages/shared",
          include: ["test/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "sync",
          root: "apps/sync",
          include: ["test/**/*.test.ts"],
          environment: "node",
          globalSetup: ["../../test/global-setup.ts"],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        resolve: {
          alias: {
            "@": new URL("./apps/web/src", import.meta.url).pathname,
            "server-only": new URL("./apps/web/test/server-only-stub.ts", import.meta.url).pathname,
          },
        },
        test: {
          name: "web",
          root: "apps/web",
          include: ["test/**/*.test.ts"],
          environment: "node",
          globalSetup: ["../../test/global-setup.ts"],
          setupFiles: ["./test/setup.ts"],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
