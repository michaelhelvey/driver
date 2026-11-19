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
const COMMAND = [process.execPath, MAIN];
const STALE = ["bun", "/old/checkout/packages/mcp/src/main.ts"];
const withApp = !process.argv.includes("--no-app");

const tmp = await mkdtemp(join(tmpdir(), "driver-setup-e2e-"));
const home = join(tmp, "home");
const apps = join(tmp, "Applications");
const configDir = join(home, ".config", "opencode");
const json = join(configDir, "opencode.json");
const jsonc = join(configDir, "opencode.jsonc");
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

const SEED = {
  $schema: "https://opencode.ai/config.json",
  model: "anthropic/claude-opus-5-5",
  default_agent: "build",
  disabled_providers: ["openai", "google"],
  permission: { external_directory: "allow" },
  plugins: ["some-plugin@1.0.0"],
  agents: { plan: { disabled: true, hidden: true } },
  commands: {
    review: { description: "review a diff", subagent: true, template: "review\n$ARGUMENTS" },
  },
  mcp: {
    servers: {
      browse: {
        type: "local",
        command: ["browse-mcp", "--stdio"],
        environment: { OPENCODE_BROWSER_RUNTIME: "chrome" },
      },
      fff: { type: "local", command: ["fff-mcp"], enabled: true },
      jira: { type: "local", command: ["bunx", "jira-mcp"] },
      pulse: {
        type: "remote",
        url: "https://pulse.example.com/mcp",
        headers: { Authorization: "Bearer not-a-real-token" },
      },
    },
  },
};

const SEED_JSON = `${JSON.stringify(SEED, null, 2)}\n`;

const SEED_JSONC = `{
  // the user's own settings: setup must leave them alone
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-opus-5-5", // trailing comment
  "mcp": { "servers": { "other": { "type": "local", "command": ["other-server"] } } },
}
`;

const SHADOWING_JSONC = `{
  // an old driver entry that overrides opencode.json's
  "mcp": { "servers": { "driver": { "type": "local", "command": ${JSON.stringify(STALE)} } } },
}
`;

const EntrySchema = z.strictObject({
  type: z.literal("local"),
  command: z.array(z.string()).min(1),
  environment: z.record(z.string(), z.string()).optional(),
});

const ConfigSchema = z.looseObject({
  mcp: z.looseObject({ servers: z.looseObject({ driver: EntrySchema }) }),
});

const readConfig = async (path: string) => {
  const text = await Bun.file(path).text();
  const parsed = ConfigSchema.parse(Bun.JSONC.parse(text));
  const { driver, ...servers } = parsed.mcp.servers;
  return {
    path,
    text,
    mtime: (await stat(path)).mtimeMs,
    driver,
    rest: { ...parsed, mcp: { ...parsed.mcp, servers } },
  };
};

type Config = Awaited<ReturnType<typeof readConfig>>;

const setup = async (title: string, args: string[], expect: "ok" | "fail" = "ok") => {
  console.log(`\n$ bun run setup ${args.join(" ")}   # ${title}`);
  const proc = Bun.spawn([process.execPath, join(CHECKOUT, "scripts", "setup.ts"), ...args], {
    cwd: CHECKOUT,
    env: ENV,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  assert.equal(code === 0, expect === "ok", `setup ${title} exited ${code}, wanted ${expect}`);
  return { stdout, stderr };
};

const APP_BINARY = join(apps, "driver.app", "Contents", "MacOS");

const appPids = async (): Promise<string[]> => {
  const proc = Bun.spawn(["pgrep", "-f", APP_BINARY], { stdout: "pipe" });
  return (await new Response(proc.stdout).text()).split("\n").filter(Boolean);
};

const startApp = async (): Promise<string[]> => {
  const app = Bun.spawn([join(APP_BINARY, "driver-desktop")], {
    env: ENV,
    stdout: "ignore",
    stderr: "ignore",
  });
  app.unref();
  assert.deepEqual(await appPids(), [String(app.pid)]);
  return [String(app.pid)];
};

const appArgs = withApp ? [] : ["--no-app"];

const unchanged = async (before: Config, title: string) => {
  const after = await readConfig(before.path);
  assert.equal(after.text, before.text, `${title}: config text changed`);
  assert.equal(after.mtime, before.mtime, `${title}: config was rewritten`);
  console.log(`  ✓ ${title}: ${before.path} byte-identical and not rewritten`);
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
  await Bun.write(json, SEED_JSON);

  await setup("first run, a realistic opencode.json", appArgs);
  if (withApp) assert.ok(await Bun.file(join(apps, "driver.app/Contents/Info.plist")).exists());
  assert.ok((await stat(root)).isDirectory());
  const first = await readConfig(json);
  assert.deepEqual(first.driver, { type: "local", command: COMMAND });
  assert.deepEqual(first.rest, SEED);
  console.log("  ✓ driver added with no environment; every other key and server unchanged");
  await serve(first.driver);

  const running = withApp ? await startApp() : [];
  const rerun = await setup(withApp ? "rerun while driver.app is running" : "rerun", appArgs);
  await unchanged(first, "rerun");
  if (withApp) {
    assert.ok(rerun.stdout.includes("(restarted it)"), "setup did not restart the running app");
    assert.equal(await Bun.file(`${apps}/driver.app.installing`).exists(), false);
    const restarted = await appPids();
    assert.ok(restarted.length > 0, "driver.app is not running after setup");
    assert.ok(
      restarted.every((pid) => !running.includes(pid)),
      "driver.app was not quit",
    );
    console.log(`  ✓ quit pid ${running.join(", ")}, restarted as pid ${restarted.join(", ")}`);
  }

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
  const fixed = await readConfig(json);
  assert.deepEqual(fixed.driver, {
    type: "local",
    command: COMMAND,
    environment: { DRIVER_ROOT: root },
  });
  assert.deepEqual(fixed.rest, SEED);
  console.log("  ✓ re-registered with this checkout's path; environment and other keys kept");

  await setup("--no-app rerun", ["--no-app"]);
  await unchanged(fixed, "--no-app rerun");
  console.log(`\n${json}:\n${fixed.text}`);

  await rm(json);
  await Bun.write(jsonc, SEED_JSONC);
  await setup("an opencode.jsonc with comments", ["--no-app"]);
  const commented = await readConfig(jsonc);
  assert.deepEqual(commented.driver, { type: "local", command: COMMAND });
  assert.ok(commented.text.includes("// the user's own settings"), "the comment was dropped");
  assert.ok(commented.text.includes("// trailing comment"), "the trailing comment was dropped");
  assert.equal(await Bun.file(json).exists(), false, "setup wrote opencode.json");
  console.log(`  ✓ written into opencode.jsonc, comments kept\n\n${jsonc}:\n${commented.text}`);

  await Bun.write(json, SEED_JSON);
  await Bun.write(jsonc, SHADOWING_JSONC);
  const shadowed = await setup(
    "a stale driver in opencode.jsonc shadows opencode.json",
    ["--no-app"],
    "fail",
  );
  assert.ok(shadowed.stderr.includes(jsonc), "the error does not name opencode.jsonc");
  console.log("  ✓ fails and names opencode.jsonc");

  await Bun.write(jsonc, SEED_JSONC);
  await setup("after following the fix: no driver in opencode.jsonc", ["--no-app"]);
  assert.deepEqual((await readConfig(json)).driver, { type: "local", command: COMMAND });
  console.log("  ✓ the fix works: opencode.json's driver is current");
} finally {
  const left = await appPids();
  if (left.length > 0) Bun.spawnSync(["kill", ...left]);
  await rm(tmp, { recursive: true, force: true });
}

console.log("\nsetup e2e: ok");
