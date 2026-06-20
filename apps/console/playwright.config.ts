import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Hermetic E2E: boot the control-plane API with a deterministic stub runner
// (StubProvider + in-memory bus, file store in a temp dir) + the Next console, and
// drive the live-run flow end to end. No network / model / Docker.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API_PORT = 8788;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun apps/api/src/index.ts",
      cwd: repoRoot,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(API_PORT),
        AURIGA_HOME: join(tmpdir(), `auriga-e2e-${process.pid}`),
        AURIGA_STUB_RUNNER: "1",
      },
    },
    {
      command: `bunx next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_PUBLIC_AURIGA_API: `http://localhost:${API_PORT}` },
    },
  ],
});
