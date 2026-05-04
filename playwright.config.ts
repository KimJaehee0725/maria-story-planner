import path from "path";
import { existsSync } from "fs";
import { defineConfig, devices } from "@playwright/test";

const root = process.cwd();
const storageDir = path.join(root, ".tmp", "e2e-storage");
const chromeAppPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserUse = {
  ...devices["Desktop Chrome"],
  ...(existsSync(chromeAppPath) ? { channel: "chrome" as const } : {}),
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 6_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: "http://127.0.0.1:8765/api/health",
      reuseExistingServer: false,
      timeout: 20_000,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "8765",
        STORAGE_DIR: storageDir,
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
  projects: [
    {
      name: "chrome",
      use: browserUse,
    },
  ],
});
