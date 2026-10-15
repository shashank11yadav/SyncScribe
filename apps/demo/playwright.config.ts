import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env.CI);
export const PREVIEW_URL = "http://localhost:5211/SyncScribe/";

/**
 * Runs against `vite preview`, which serves the production build with the
 * CSP meta tag. Build first (`npm run e2e` does both).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: PREVIEW_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview",
    url: PREVIEW_URL,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
