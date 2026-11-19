import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApplyOutputSchema,
  ApplyToolInputSchema,
  CreateProjectInputSchema,
  CreateProjectOutputSchema,
  GetProjectInputSchema,
  GetProjectOutputSchema,
  ListProjectsInputSchema,
  ListProjectsOutputSchema,
  NeedsMeInputSchema,
  NeedsMeOutputSchema,
  parseProject,
  ReadInputSchema,
  ReadOutputSchema,
} from "@driver/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Glob } from "bun";
import { z } from "zod";

const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const FIXTURES = join(import.meta.dir, "..", "..", "core", "fixtures");
const STAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g;
const LOCK_TIMEOUT_MS = 200;

const LogLineSchema = z.strictObject({
  tool: z.string(),
  project: z.string().nullable(),
  ops: z.int(),
  ms: z.int(),
  error: z.string().nullable(),
});

let root = "";
let client = new Client({ name: "driver-e2e", version: "0" });
let stderr: string[] = [];
let transportErrors: string[] = [];

const pdk = (path = "") => join(root, "pdk-2-sentry", path);

const tree = async (dir: string): Promise<Map<string, string>> => {
  const paths = (await Array.fromAsync(new Glob("**").scan({ cwd: dir, dot: true }))).toSorted();
  const texts = await Promise.all(paths.map((path) => Bun.file(join(dir, path)).text()));
  return new Map(paths.map((path, i) => [path, texts[i] ?? ""]));
};

const textOf = (result: z.infer<typeof CallToolResultSchema>): string =>
  result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const raw = async (name: string, args: Record<string, unknown>) =>
  CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));

const call = async <S extends z.ZodType>(
  name: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> => {
  const result = await raw(name, args);
  if (result.isError === true) throw new Error(`${name}: ${textOf(result)}`);
  return schema.parse(result.structuredContent);
};

const refusal = async (name: string, args: Record<string, unknown>): Promise<string> => {
  const result = await raw(name, args);
  expect(result.isError).toBe(true);
  return textOf(result);
};

const markDone = (id: string) =>
  call(
    "apply",
    {
      slug: "pdk-2-sentry",
      log: `${id} is done.`,
      ops: [{ op: "task", id, status: { kind: "done" } }],
    },
    ApplyOutputSchema,
  );

const reparse = async (slug: string) => {
  const files = await tree(join(root, slug));
  return parseProject(files);
};

const logLines = async (count: number, tries = 200): Promise<z.infer<typeof LogLineSchema>[]> => {
  const calls = stderr.filter((line) => line.includes('"tool"'));
  if (calls.length >= count || tries === 0) {
    return calls.map((line) => LogLineSchema.parse(JSON.parse(line)));
  }
  await Bun.sleep(10);
  return logLines(count, tries - 1);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "driver-e2e-"));
  await cp(FIXTURES, root, { recursive: true });
  stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MAIN],
    env: { DRIVER_ROOT: root, DRIVER_LOCK_TIMEOUT_MS: String(LOCK_TIMEOUT_MS) },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderr.push(...chunk.toString().split("\n").filter(Boolean));
  });
  client = new Client({ name: "driver-e2e", version: "0" });
  transportErrors = [];
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- Client is not an EventTarget
  client.onerror = (error) => transportErrors.push(error.message);
  await client.connect(transport);
});

afterEach(async () => {
  await client.close();
  await rm(root, { recursive: true, force: true });
  expect(transportErrors).toEqual([]);
});

describe("driver MCP server over stdio", () => {
  it("lists the six tools with core's descriptions", async () => {
    const { tools } = await client.listTools();
    expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.description]))).toEqual({
      list_projects: ListProjectsInputSchema.description,
      get_project: GetProjectInputSchema.description,
      read: ReadInputSchema.description,
      needs_me: NeedsMeInputSchema.description,
      create_project: CreateProjectInputSchema.description,
      apply: ApplyToolInputSchema.description,
    });
  });

  it("answers the read tools from the fixtures", async () => {
    const { projects } = await call("list_projects", {}, ListProjectsOutputSchema);
    expect(projects.map((p) => [p.slug, p.percent])).toEqual([
      ["billing-ledger-v2", 40],
      ["driver", (await reparse("driver")).progress.percent],
      ["onboarding-docs", 33],
      ["pdk-2-sentry", 33],
    ]);
    const project = await call("get_project", { slug: "pdk-2-sentry" }, GetProjectOutputSchema);
    expect(project.progress).toEqual({ done: 9, total: 27, skipped: 1, percent: 33 });
    expect(project.phases.find((p) => p.id === "framework-apps")?.tasks[0]?.label).toBe("03a.1");
    const { files } = await call(
      "read",
      { slug: "pdk-2-sentry", refs: ["t4-coa", "log"] },
      ReadOutputSchema,
    );
    expect(files.map((f) => f.path)).toEqual(["03a-framework-apps/01-t4-coa.md", "log.md"]);
    expect(files[0]?.content).toBe(await Bun.file(pdk("03a-framework-apps/01-t4-coa.md")).text());
    const { tasks } = await call("needs_me", {}, NeedsMeOutputSchema);
    expect(tasks.filter((t) => t.project === "pdk-2-sentry").map((t) => t.id)).toEqual([
      "t4-agent-skills",
      "t4-authorization-platform",
      "t4-user-info",
    ]);
  });

  it("create_project writes project.md and an empty log.md", async () => {
    const args = { slug: "new-one", title: "new one", repo: "~/dev/new", summary: "A project." };
    const out = await call("create_project", args, CreateProjectOutputSchema);
    expect(out).toEqual({ slug: "new-one" });
    const files = await tree(join(root, "new-one"));
    expect([...files.keys()]).toEqual(["log.md", "project.md"]);
    expect(files.get("log.md")).toBe("---\ntitle: log\n---\n");
    expect(
      files
        .get("project.md")
        ?.replace(STAMP, "<now>")
        .replace(/\d{4}-\d{2}-\d{2}/, "<day>"),
    ).toBe(
      `---\ntitle: new one\nrepo: ~/dev/new\nstarted: <day>\nupdated: <now>\n---\n\nA project.\n`,
    );
    expect((await reparse("new-one")).meta.title).toBe("new one");
    expect(await refusal("create_project", args)).toContain('project "new-one" already exists');
  });

  it("apply marks t4-agent-skills done: 37%, exact frontmatter, log appended last", async () => {
    const path = pdk("01-framework/02-t4-agent-skills.md");
    const [taskBefore, logBefore] = [
      await Bun.file(path).text(),
      await Bun.file(pdk("log.md")).text(),
    ];
    const out = await call(
      "apply",
      {
        slug: "pdk-2-sentry",
        log: "t4-agent-skills #31 merged.",
        ops: [{ op: "task", id: "t4-agent-skills", status: { kind: "done" } }],
      },
      ApplyOutputSchema,
    );
    expect(out.changed).toEqual(["01-framework/02-t4-agent-skills.md", "log.md"]);
    const project = await call("get_project", { slug: "pdk-2-sentry" }, GetProjectOutputSchema);
    expect(project.progress.percent).toBe(37);
    const at = project.log[0]?.at ?? "";
    expect(project.log[0]).toEqual({ at, text: "t4-agent-skills #31 merged." });
    const body = taskBefore.slice(taskBefore.indexOf("\n---\n") + 5);
    expect(await Bun.file(path).text()).toBe(
      `---\ntitle: t4-agent-skills\nstatus: done\nrepo: t4-agent-skills\npr: "#31"\nupdated: ${at}\n---\n${body}`,
    );
    expect(await Bun.file(pdk("log.md")).text()).toBe(
      `${logBefore}\n## ${at}\n\nt4-agent-skills #31 merged.\n`,
    );
    const reparsed = await reparse("pdk-2-sentry");
    expect(reparsed.progress.percent).toBe(37);
    expect(reparsed.log.at(-1)?.text).toBe("t4-agent-skills #31 merged.");
  });

  it("apply renames and renumbers, and empties a phase folder that has a .DS_Store", async () => {
    await Bun.write(pdk("04-cleanup/.DS_Store"), "finder");
    await call(
      "apply",
      {
        slug: "pdk-2-sentry",
        log: "Cleanup goes first now; t4-coa moved into it.",
        ops: [
          { op: "phase", id: "cleanup", after: null },
          { op: "task", id: "t4-coa", phase: "cleanup", after: null },
          { op: "task", id: "follow-up", phase: "cleanup", title: "follow up" },
        ],
      },
      ApplyOutputSchema,
    );
    const files = await tree(pdk());
    expect([...files.keys()].filter((path) => path.startsWith("."))).toEqual([]);
    expect([...new Set([...files.keys()].map((path) => path.split("/")[0]))]).toEqual([
      "00-cleanup",
      "01-pdk-2.0",
      "02-framework",
      "03-canaries",
      "04-framework-apps",
      "05-custom-builds",
      "06-pdk-bump",
      "log.md",
      "project.md",
    ]);
    expect([...files.keys()].filter((path) => path.startsWith("00-cleanup/"))).toEqual([
      "00-cleanup/01-t4-coa.md",
      "00-cleanup/02-ssm-alias.md",
      "00-cleanup/03-follow-up.md",
      "00-cleanup/phase.md",
    ]);
    const reparsed = await reparse("pdk-2-sentry");
    expect(reparsed.tasks).toHaveLength(29);
    expect(reparsed.tasks.find((t) => t.id === "t4-developer-dashboard")?.label).toBe("04.2");
  });

  it("two concurrent applies to one project both land, and log.md has both entries", async () => {
    await Promise.all([markDone("t4-agent-skills"), markDone("t4-coa")]);
    const project = await reparse("pdk-2-sentry");
    expect(
      project.tasks
        .filter((t) => ["t4-agent-skills", "t4-coa"].includes(t.id))
        .map((t) => t.status),
    ).toEqual([{ kind: "done" }, { kind: "done" }]);
    expect(
      project.log
        .slice(-2)
        .map((e) => e.text)
        .toSorted(),
    ).toEqual(["t4-agent-skills is done.", "t4-coa is done."]);
    expect(project.progress.done).toBe(11);
  });

  it.each([
    {
      name: "a bad blocked_by",
      ops: [{ op: "task", id: "t4-coa", status: { kind: "blocked", on: "x", by: "ghost" } }],
      error: 'task "t4-coa": blocked_by "ghost" is not a task',
    },
    {
      name: "a needs-you without an ask",
      ops: [{ op: "task", id: "t4-coa", status: { kind: "needs-you" } }],
      error: "invalid arguments",
    },
    {
      name: "a valid op followed by an invalid one",
      ops: [
        { op: "phase", id: "cleanup", after: null },
        { op: "task", id: "t4-coa", after: "nope" },
      ],
      error: 'no task "nope"',
    },
  ])("an invalid batch ($name) changes nothing on disk", async (c) => {
    const before = await tree(root);
    const error = await refusal("apply", { slug: "pdk-2-sentry", log: "x.", ops: c.ops });
    expect(error).toContain(c.error);
    expect(await tree(root)).toEqual(before);
  });

  it("a stale .lock fails apply after the timeout with the lock path, and writes nothing", async () => {
    await Bun.write(pdk(".lock"), "");
    const before = await tree(root);
    const error = await refusal("apply", {
      slug: "pdk-2-sentry",
      log: "x.",
      ops: [{ op: "task", id: "t4-coa", status: { kind: "done" } }],
    });
    expect(error).toContain(`${pdk(".lock")} is still there after ${LOCK_TIMEOUT_MS}ms`);
    expect(await tree(root)).toEqual(before);
  });

  it.each(["~/.driver", ".driver"])(
    "refuses to start with DRIVER_ROOT=%s and creates nothing",
    async (relative) => {
      const before = await readdir(root);
      const proc = Bun.spawn([process.execPath, MAIN], {
        cwd: root,
        env: { DRIVER_ROOT: relative },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await proc.exited).not.toBe(0);
      expect(await new Response(proc.stderr).text()).toContain(
        "DRIVER_ROOT must be an absolute path",
      );
      expect(await new Response(proc.stdout).text()).toBe("");
      expect(await readdir(root)).toEqual(before);
    },
  );

  it("logs every call to stderr as one JSON line", async () => {
    await call("get_project", { slug: "pdk-2-sentry" }, GetProjectOutputSchema);
    await refusal("apply", { slug: "pdk-2-sentry", log: "x.", ops: [{ op: "task", id: "nope" }] });
    await refusal("get_project", { slug: "Not A Slug" });
    const lines = await logLines(3);
    expect(
      lines.map((line) => ({
        tool: line.tool,
        project: line.project,
        ops: line.ops,
        failed: line.error !== null,
      })),
    ).toEqual([
      { tool: "get_project", project: "pdk-2-sentry", ops: 0, failed: false },
      { tool: "apply", project: "pdk-2-sentry", ops: 1, failed: true },
      { tool: "get_project", project: "Not A Slug", ops: 0, failed: true },
    ]);
  });
});
