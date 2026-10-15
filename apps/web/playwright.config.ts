import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5200",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: ci ? "npm run start -w @syncscribe/sync" : "npm run dev -w @syncscribe/sync",
      cwd: "../..",
      url: "http://localhost:5201/healthz",
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: ci ? "npm run start" : "npm run dev",
      url: "http://localhost:5200",
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
