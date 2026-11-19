#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDisk } from "./disk.ts";
import { createServer } from "./server.ts";

const EnvSchema = z.object({
  DRIVER_ROOT: z
    .string()
    .refine(isAbsolute, "DRIVER_ROOT must be an absolute path (`~` is not expanded)")
    .default(join(homedir(), ".driver")),
  DRIVER_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

const env = EnvSchema.parse(process.env);
await mkdir(env.DRIVER_ROOT, { recursive: true });
const server = createServer(
  createDisk(env.DRIVER_ROOT, { lockTimeoutMs: env.DRIVER_LOCK_TIMEOUT_MS }),
);
await server.connect(new StdioServerTransport());
process.stderr.write(`${JSON.stringify({ started: env.DRIVER_ROOT })}\n`);
