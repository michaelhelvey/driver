import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DESKTOP = join(import.meta.dir, "..");
const FIXTURES = join(DESKTOP, "..", "..", "packages", "core", "fixtures");

const root = await mkdtemp(join(tmpdir(), "driver-e2e-"));
await cp(FIXTURES, root, { recursive: true });
console.log(`e2e: DRIVER_ROOT=${root}`);

try {
  const wdio = Bun.spawn(["npx", "--no-install", "wdio", "run", "e2e/wdio.conf.ts"], {
    cwd: DESKTOP,
    env: { ...process.env, DRIVER_ROOT: root },
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exitCode = await wdio.exited;
} finally {
  await rm(root, { recursive: true, force: true });
}
