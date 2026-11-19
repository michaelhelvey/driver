#!/usr/bin/env bun
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { registration } from "./opencode.ts";

const CHECKOUT = join(import.meta.dir, "..");
const MAIN = join(CHECKOUT, "packages", "mcp", "src", "main.ts");
const COMMAND = [process.execPath, MAIN];
const BUNDLE = join(CHECKOUT, "apps/desktop/src-tauri/target/release/bundle/macos/driver.app");
const APP = join(process.env.DRIVER_APPLICATIONS_DIR ?? "/Applications", "driver.app");
const ROOT = join(homedir(), ".driver");
const OPENCODE_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode");

const USAGE = "usage: bun run setup [--no-app]";
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--no-app")) {
  console.error(USAGE);
  process.exit(2);
}
const withApp = !args.includes("--no-app");

type Outcome = { kind: "done"; line: string } | { kind: "skipped"; line: string; why: string };

class StepFailed extends Error {
  constructor(
    message: string,
    readonly fix: string,
  ) {
    super(message);
  }
}

const done = (line: string): Outcome => ({ kind: "done", line });
const skipped = (line: string, why: string): Outcome => ({ kind: "skipped", line, why });

const run = async (cmd: readonly string[]): Promise<{ code: number; output: string }> => {
  const proc = Bun.spawn([...cmd], { cwd: CHECKOUT, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: `${out}${err}`.trim() };
};

const must = async (cmd: readonly string[], fix: string): Promise<string> => {
  const { code, output } = await run(cmd);
  if (code !== 0) throw new StepFailed(`\`${cmd.join(" ")}\` exited ${code}:\n${output}`, fix);
  return output;
};

const need = (tool: string, fix: string): void => {
  if (Bun.which(tool) === null) throw new StepFailed(`${tool} is not installed`, fix);
};

const RUSTUP = "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh";

const prereqs = async (): Promise<Outcome> => {
  if (process.platform !== "darwin") throw new StepFailed("driver is macOS only", "use a Mac");
  if (!Bun.semver.satisfies(Bun.version, ">=1.4.0"))
    throw new StepFailed(`bun ${Bun.version} is too old`, "bun upgrade");
  if (!withApp) return done("prereqs: macOS, bun");
  need("cargo", RUSTUP);
  need("rustc", RUSTUP);
  await must(["xcode-select", "-p"], "xcode-select --install");
  return done("prereqs: macOS, bun, rust, xcode tools");
};

const install = async (): Promise<Outcome> => {
  await must([process.execPath, "install"], `cd ${CHECKOUT} && bun install`);
  return done("bun install");
};

const build = async (): Promise<Outcome> => {
  if (!withApp) return skipped("build driver.app", "--no-app");
  await must(
    [process.execPath, "run", "--cwd", "apps/desktop", "tauri", "build"],
    `fix the build error above, then rerun: cd ${CHECKOUT} && bun run setup`,
  );
  return done(`build driver.app`);
};

const quitInstalled = async (): Promise<boolean> => {
  const { output } = await run(["pgrep", "-f", `${APP}/Contents/MacOS/`]);
  const pids = output.split("\n").filter(Boolean);
  if (pids.length === 0) return false;
  await must(["kill", ...pids], `quit driver, then rerun`);
  await must(["sh", "-c", `while kill -0 ${pids.join(" ")} 2>/dev/null; do sleep 0.1; done`], "");
  return true;
};

const installApp = async (): Promise<Outcome> => {
  if (!withApp) return skipped(`install ${APP}`, "--no-app");
  const wasRunning = await quitInstalled();
  await rm(APP, { recursive: true, force: true });
  await must(["ditto", BUNDLE, APP], `cp -R ${BUNDLE} ${APP}`);
  if (wasRunning) await must(["open", APP], `open ${APP}`);
  return done(`install ${APP}${wasRunning ? " (restarted it)" : ""}`);
};

const makeRoot = async (): Promise<Outcome> => {
  await mkdir(ROOT, { recursive: true });
  return done(`mkdir ${ROOT}`);
};

const readConfigs = async (): Promise<unknown[]> => {
  const files = ["opencode.jsonc", "opencode.json"].map((name) =>
    Bun.file(join(OPENCODE_DIR, name)),
  );
  const found = await Promise.all(files.map(async (file) => ((await file.exists()) ? file : null)));
  const texts = await Promise.all(found.flatMap((file) => (file === null ? [] : [file.text()])));
  return texts.map((text) => Bun.JSONC.parse(text));
};

const ADD = ["opencode", "mcp", "add", "driver", "--global"];

const addDriver = async (environment: Record<string, string>): Promise<void> => {
  const env = Object.entries(environment).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
  const fix = [...ADD, "--", ...COMMAND].join(" ");
  await must([...ADD, ...env, "--", ...COMMAND], fix);
  if (registration(await readConfigs(), COMMAND).kind !== "current")
    throw new StepFailed(`opencode mcp add did not write driver to ${OPENCODE_DIR}`, fix);
};

const registerOpencode = async (): Promise<Outcome> => {
  if (Bun.which("opencode") === null) return skipped("opencode", "opencode not installed");
  const plan = registration(await readConfigs(), COMMAND);
  if (plan.kind === "current") return done(`opencode: driver already runs ${MAIN}`);
  await addDriver(plan.environment);
  const was = plan.was === null ? "" : ` (was ${plan.was.join(" ")})`;
  return done(`opencode: driver runs ${MAIN}${was}`);
};

const LIVE = process.stdout.isTTY;

const step = async (pending: string, body: () => Promise<Outcome>): Promise<Outcome> => {
  if (LIVE) process.stdout.write(`… ${pending}`);
  const outcome = await body();
  const text =
    outcome.kind === "done" ? `✓ ${outcome.line}` : `– ${outcome.line}: skipped (${outcome.why})`;
  process.stdout.write(`${LIVE ? "\r\u001B[K" : ""}${text}\n`);
  return outcome;
};

const runSteps = async () => {
  await step("checking prereqs", prereqs);
  await step("bun install", install);
  await step("building driver.app (minutes the first time)", build);
  const app = await step(`installing ${APP}`, installApp);
  await step(`mkdir ${ROOT}`, makeRoot);
  const opencode = await step("registering the MCP server in opencode", registerOpencode);
  return { app, opencode };
};

const summary = (outcomes: Awaited<ReturnType<typeof runSteps>>): string[] => [
  outcomes.app.kind === "done"
    ? `driver.app is installed: open ${APP}`
    : "driver.app: not installed (--no-app)",
  outcomes.opencode.kind === "done"
    ? "opencode: driver MCP server registered"
    : "no harness registered: install opencode, then rerun `bun run setup`",
  "in any project, tell your coordinator: track this in driver",
];

try {
  console.log(`\n${summary(await runSteps()).join("\n")}`);
} catch (error) {
  if (!(error instanceof StepFailed)) throw error;
  if (LIVE) process.stdout.write("\r\u001B[K");
  console.error(`✗ ${error.message}\n  fix: ${error.fix}`);
  process.exit(1);
}
