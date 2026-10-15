// Runs a command with the repository-root .env loaded, so every workspace in
// the monorepo shares one env file in development. Hosted deploys set real
// environment variables and do not use this.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [command, ...args] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const bins = { next: "next/dist/bin/next", playwright: "@playwright/test/cli" };
const target = bins[command];
if (!target) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

const child = spawn(process.execPath, [require.resolve(target), ...args], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
