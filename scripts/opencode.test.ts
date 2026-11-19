import { describe, expect, it } from "bun:test";
import { registration, type Registration } from "./opencode.ts";

const WANT = ["/bin/bun", "/new/packages/mcp/src/main.ts"];
const OLD = ["bun", "/old/packages/mcp/src/main.ts"];

const driver = (entry: Record<string, unknown>) => ({
  $schema: "https://opencode.ai/config.json",
  model: "x/y",
  mcp: { servers: { other: { type: "local", command: ["other"] }, driver: entry } },
});

describe("registration", () => {
  it.each<[string, unknown[], Registration]>([
    ["no config file", [], { kind: "register", was: null, environment: {} }],
    ["an empty config", [{}], { kind: "register", was: null, environment: {} }],
    [
      "other servers only",
      [{ mcp: { servers: { other: { type: "local", command: ["x"] } } } }],
      { kind: "register", was: null, environment: {} },
    ],
    [
      "a V1-shaped config",
      [{ mcp: { driver: { type: "local", command: WANT } } }],
      { kind: "register", was: null, environment: {} },
    ],
    ["the same command", [driver({ type: "local", command: WANT })], { kind: "current" }],
    [
      "the same command with an environment",
      [driver({ type: "local", command: WANT, environment: { DRIVER_ROOT: "/r" } })],
      { kind: "current" },
    ],
    [
      "a moved checkout",
      [driver({ type: "local", command: OLD })],
      { kind: "register", was: OLD, environment: {} },
    ],
    [
      "a moved checkout with an environment",
      [driver({ type: "local", command: OLD, environment: { DRIVER_ROOT: "/r" } })],
      { kind: "register", was: OLD, environment: { DRIVER_ROOT: "/r" } },
    ],
    [
      "extra args",
      [driver({ type: "local", command: [...WANT, "--x"] })],
      { kind: "register", was: [...WANT, "--x"], environment: {} },
    ],
    [
      "the entry in the second file",
      [{ model: "x/y" }, driver({ type: "local", command: WANT })],
      { kind: "current" },
    ],
  ])("%s", (_, configs, expected) => {
    expect(registration(configs, WANT)).toEqual(expected);
  });
});
