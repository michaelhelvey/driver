import { z } from "zod";

const EntrySchema = z.object({
  command: z.array(z.string()),
  environment: z.record(z.string(), z.string()).default({}),
});

const ConfigSchema = z.object({
  mcp: z.object({ servers: z.object({ driver: EntrySchema }) }),
});

/**
 * What setup must do about the `driver` entry in OpenCode's global config. `current`: the entry
 * already runs `command`, so nothing is written. `register`: (re-)add it with
 * `opencode mcp add driver --global`, keeping the entry's `environment`. `was` is the stale command,
 * or `null` when there is no entry.
 */
export type Registration =
  | { kind: "current" }
  | { kind: "register"; was: readonly string[] | null; environment: Record<string, string> };

const sameCommand = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((part, i) => part === b[i]);

/**
 * Decides whether OpenCode's `driver` entry needs (re-)registering. `configs` are the parsed global
 * config files (`opencode.jsonc`, `opencode.json`); the first with a `driver` entry wins.
 *
 * @example
 * registration([{ mcp: { servers: { driver: { type: "local", command: ["bun", "/old/main.ts"] } } } }], ["bun", "/new/main.ts"]);
 * // { kind: "register", was: ["bun", "/old/main.ts"], environment: {} }
 */
export function registration(
  configs: readonly unknown[],
  command: readonly string[],
): Registration {
  const entry = configs
    .map((config) => ConfigSchema.safeParse(config))
    .find((parsed) => parsed.success)?.data.mcp.servers.driver;
  if (entry === undefined) return { kind: "register", was: null, environment: {} };
  if (sameCommand(entry.command, command)) return { kind: "current" };
  return { kind: "register", was: entry.command, environment: entry.environment };
}
