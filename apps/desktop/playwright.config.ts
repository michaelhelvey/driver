import { createServer } from "node:net";
import { defineConfig } from "@playwright/test";

const freePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer().unref();
    server.on("error", reject);
    server.listen(0, "localhost", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });

process.env["E2E_WEB_PORT"] ??= String(await freePort());
const PORT = Number(process.env["E2E_WEB_PORT"]);

/**
 * `bun run e2e:web`: the browser build on the bundled fixtures, in the installed Chrome, driven
 * by the keyboard only. It starts its own dev server on a free port (`E2E_WEB_PORT`, picked once
 * per run and inherited by the workers), so runs in several worktrees do not collide.
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
