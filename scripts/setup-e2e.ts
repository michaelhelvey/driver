#!/usr/bin/env bun
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DRIVER_INSTRUCTIONS, ListProjectsOutputSchema } from "@driver/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

const CHECKOUT = join(import.meta.dir, "..");
const MAIN = join(CHECKOUT, "packages", "mcp", "src", "main.ts");
const STALE = ["bun", "/old/checkout/packages/mcp/src/main.ts"];
const withApp = !process.argv.includes("--no-app");

const tmp = await mkdtemp(join(tmpdir(), "driver-setup-e2e-"));
const home = join(tmp, "home");
const apps = join(tmp, "Applications");
const configDir = join(home, ".config", "opencode");
const config = join(configDir, "opencode.jsonc");
const root = join(home, ".driver");

const ENV = {
  ...process.env,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  CARGO_HOME: process.env.CARGO_HOME ?? join(homedir(), ".cargo"),
  RUSTUP_HOME: process.env.RUSTUP_HOME ?? join(homedir(), ".rustup"),
  BUN_INSTALL_CACHE_DIR: process.env.BUN_INSTALL_CACHE_DIR ?? join(homedir(), ".bun/install/cache"),
  DRIVER_APPLICATIONS_DIR: apps,
};

const SEED = `{
  // the user's own settings: setup must leave them alone
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-opus-5-5",
  "mcp": { "servers": { "other": { "type": "local", "command": ["other-server"] } } },
}
`;

const EntrySchema = z.object({
  type: z.literal("local"),
  command: z.array(z.string()).min(1),
  environment: z.record(z.string(), z.string()).optional(),
});

const ConfigSchema = z.object({
  model: z.literal("anthropic/claude-opus-5-5"),
  mcp: z.object({
    servers: z.object({
      other: z.object({ command: z.tuple([z.literal("other-server")]) }),
      driver: EntrySchema,
    }),
  }),
});

const readConfig = async () => {
  const text = await Bun.file(config).text();
  return {
    text,
    mtime: (await stat(config)).mtimeMs,
    parsed: ConfigSchema.parse(Bun.JSONC.parse(text)),
  };
};

const setup = async (title: string, args: string[] = []): Promise<void> => {
  console.log(`\n$ bun run setup ${args.join(" ")}   # ${title}`);
  const proc = Bun.spawn([process.execPath, join(CHECKOUT, "scripts", "setup.ts"), ...args], {
    cwd: CHECKOUT,
    env: ENV,
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await proc.exited, 0, `setup ${title} failed`);
};

const unchanged = async (before: Awaited<ReturnType<typeof readConfig>>, title: string) => {
  const after = await readConfig();
  assert.equal(after.text, before.text, `${title}: config text changed`);
  assert.equal(after.mtime, before.mtime, `${title}: config was rewritten`);
  console.log(`  ✓ ${title}: ${config} byte-identical and not rewritten`);
};

const serve = async (entry: z.infer<typeof EntrySchema>) => {
  const [command, ...args] = entry.command;
  assert.ok(command !== undefined);
  const transport = new StdioClientTransport({
    command,
    args,
    env: { HOME: home, PATH: process.env.PATH ?? "", ...entry.environment },
    stderr: "ignore",
  });
  const client = new Client({ name: "setup-e2e", version: "0" });
  await client.connect(transport);
  try {
    assert.equal(client.getInstructions(), DRIVER_INSTRUCTIONS);
    const result = await client.callTool({ name: "list_projects", arguments: {} });
    const { projects } = ListProjectsOutputSchema.parse(result.structuredContent);
    assert.deepEqual(projects, []);
    console.log(
      `  ✓ ${entry.command.join(" ")}: initialize has DRIVER_INSTRUCTIONS, list_projects → []`,
    );
  } finally {
    await client.close();
  }
};

try {
  await mkdir(configDir, { recursive: true });
  await Bun.write(config, SEED);

  await setup("first run", withApp ? [] : ["--no-app"]);
  if (withApp) assert.ok(await Bun.file(join(apps, "driver.app/Contents/Info.plist")).exists());
  assert.ok((await stat(root)).isDirectory());
  const first = await readConfig();
  assert.deepEqual(first.parsed.mcp.servers.driver.command, [process.execPath, MAIN]);
  assert.ok(first.text.includes("// the user's own settings"), "the comment was dropped");

  await setup("rerun", withApp ? [] : ["--no-app"]);
  await unchanged(first, "rerun");

  const moved = Bun.spawn(
    [
      "opencode",
      "mcp",
      "add",
      "driver",
      "--global",
      "--env",
      `DRIVER_ROOT=${root}`,
      "--",
      ...STALE,
    ],
    { env: ENV, stdout: "ignore", stderr: "inherit" },
  );
  assert.equal(await moved.exited, 0);
  console.log(`\n# the checkout "moved": driver now runs ${STALE.join(" ")}`);
  await setup("after the move", ["--no-app"]);
  const fixed = await readConfig();
  assert.deepEqual(fixed.parsed.mcp.servers.driver, {
    type: "local",
    command: [process.execPath, MAIN],
    environment: { DRIVER_ROOT: root },
  });
  console.log("  ✓ re-registered with this checkout's path; environment kept");

  await setup("--no-app rerun", ["--no-app"]);
  await unchanged(fixed, "--no-app rerun");

  console.log(`\n${config}:\n${fixed.text}`);
  await serve(fixed.parsed.mcp.servers.driver);
  console.log("\nsetup e2e: ok");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
