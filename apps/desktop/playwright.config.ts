import { defineConfig } from "@playwright/test";

const PORT = 1433;

/**
 * `bun run e2e:web`: the browser build on the bundled fixtures, in the installed Chrome, driven
 * by the keyboard only. It starts its own dev server on port 1433.
 */
export default defineConfig({
  testDir: "e2e/web",
  testMatch: "*.pw.ts",
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 2_000 },
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: "chrome",
    viewport: { width: 1280, height: 820 },
    colorScheme: "light",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: `bunx vp dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    stdout: "ignore",
  },
});
