import { describe, expect, it } from "bun:test";
import {
  executePlan,
  parseProject,
  planApply,
  planCreate,
  type Plan,
  type Status,
} from "../src/index.ts";
import { loadFixture, taskOf as task } from "./fixtures.ts";

const NOW = new Date("2026-11-20T09:00:00.000Z");
const STAMP = "2026-11-20T09:00:00Z";
const files = await loadFixture("pinion-2-plugins");
const current = parseProject(files);

const run = (ops: readonly unknown[], log = "something happened.") => {
  const result = planApply(current, { log, ops }, NOW);
  if (result.kind === "error") throw new Error(result.message);
  result.steps.forEach((_, i) => {
    parseProject(executePlan(files, { ...result, steps: result.steps.slice(0, i) }));
  });
  const next = executePlan(files, result);
  return { plan: result, next, project: parseProject(next) };
};

const frontmatterKeys = (text: string | undefined): string[] =>
  [
    ...(String(text)
      .split("---")[1]
      ?.matchAll(/^(\w+):/gm) ?? []),
  ].map((match) => String(match[1]));

const STEP_RANK = { write: 0, move: 1, rename: 2, remove: 3 } as const;

const stepRank = (step: Plan["steps"][number]): number => STEP_RANK[step.kind];

describe("planApply", () => {
  it("marks pinion-docs done: 37%, updated set, log appended, round-trips", () => {
    const { plan, next, project } = run(
      [{ op: "task", id: "pinion-docs", status: { kind: "done" } }],
      "pinion-docs #17 merged.",
    );
    expect(project.progress.percent).toBe(37);
    expect(task(project, "pinion-docs").updated).toBe(STAMP);
    expect(project.log.at(-1)).toEqual({ at: STAMP, text: "pinion-docs #17 merged." });
    expect(project.updated).toBe(STAMP);
    expect(plan.project.progress).toEqual(project.progress);
    expect(next.get("01-framework/02-pinion-docs.md")).not.toContain("ask:");
    expect(next.get("01-framework/02-pinion-docs.md")).toContain('pr: "#17"');
  });

  it.each<{ name: string; id: string; status: Status; keys: string[] }>([
    {
      name: "needs-you → blocked drops ask",
      id: "plugin-images",
      status: { kind: "blocked", on: "asset server RTT data", by: "plugin-sitemap" },
      keys: ["title", "status", "blocked_on", "blocked_by", "repo", "pr", "updated"],
    },
    {
      name: "blocked → skipped drops blocked_on",
      id: "plugin-embeds",
      status: { kind: "skipped", why: "repo archived" },
      keys: ["title", "status", "why", "repo", "updated"],
    },
    {
      name: "todo → needs-you adds ask",
      id: "plugin-sitemap",
      status: { kind: "needs-you", ask: "build broke: tsdown exit 1" },
      keys: ["title", "status", "ask", "repo", "updated"],
    },
    {
      name: "needs-you → done drops ask",
      id: "pinion-docs",
      status: { kind: "done" },
      keys: ["title", "status", "repo", "pr", "updated"],
    },
  ])("status change: $name", (c) => {
    const { next, project } = run([{ op: "task", id: c.id, status: c.status }]);
    expect(frontmatterKeys(next.get(task(project, c.id).path))).toEqual(c.keys);
    expect(task(project, c.id).status).toEqual(c.status);
  });

  it("creates a phase and a task in one batch, with prefixes after the last", () => {
    const { plan, project } = run([
      { op: "phase", id: "follow-up", title: "follow-up", body: "After cleanup." },
      { op: "task", id: "docs", phase: "follow-up", title: "write docs", body: "- [ ] a\n- [x] b" },
    ]);
    expect(project.phases.at(-1)?.path).toBe("05-follow-up");
    expect(task(project, "docs")).toMatchObject({ label: "05.1", steps: { done: 1, total: 2 } });
    expect(plan.steps.filter((s) => s.kind === "move")).toEqual([]);
  });

  it.each([
    { name: "task title", op: { op: "task", id: "plugin-sitemap", title: "plugin-sitemap ---" } },
    {
      name: "ask",
      op: { op: "task", id: "plugin-sitemap", status: { kind: "needs-you", ask: "keep it? ---" } },
    },
    { name: "phase title", op: { op: "phase", id: "cleanup", title: "cleanup ---" } },
    {
      name: "body that starts with ---",
      op: { op: "task", id: "plugin-sitemap", body: "---\n- [ ] a" },
    },
  ])("reads back a $name that has --- in it", (c) => {
    const { op, ...fields } = c.op;
    const { project } = run([c.op]);
    const item =
      op === "phase" ? project.phases.find((p) => p.id === fields.id) : task(project, fields.id);
    expect(item).toMatchObject(fields);
  });

  it("updates fields and leaves the rest unchanged", () => {
    const { project } = run([
      { op: "task", id: "plugin-sitemap", pr: "#64", title: "plugin-sitemap (merged)" },
    ]);
    const after = task(project, "plugin-sitemap");
    expect(after).toMatchObject({
      pr: "#64",
      title: "plugin-sitemap (merged)",
      repo: "plugin-sitemap",
    });
    expect(after.body).toBe(task(current, "plugin-sitemap").body);
    expect(after.status).toEqual({ kind: "todo" });
  });

  it("moves a task to another phase: it goes last there, the old phase keeps its numbers", () => {
    const { plan, project } = run([{ op: "task", id: "plugin-embeds", phase: "framework-apps" }]);
    expect(task(project, "plugin-embeds").path).toBe("03a-framework-apps/08-plugin-embeds.md");
    expect(task(project, "plugin-favicons").label).toBe("03c.3");
    expect(plan.steps).toContainEqual({
      kind: "move",
      from: "03c-core-bump/02-plugin-embeds.md",
      to: "03a-framework-apps/08-plugin-embeds.md",
    });
  });

  it("moves a task into a phase made in the same batch; every tree mid-apply parses", () => {
    const { project } = run([
      { op: "phase", id: "follow-up", title: "follow-up" },
      { op: "task", id: "plugin-sitemap", phase: "follow-up" },
    ]);
    expect(task(project, "plugin-sitemap").path).toBe("05-follow-up/01-plugin-sitemap.md");
  });

  it.each([
    {
      name: "swap 01 and 02 in a phase",
      ops: [{ op: "task", id: "plugin-sitemap", after: "plugin-analytics" }],
      paths: {
        "plugin-analytics": "03a-framework-apps/01-plugin-analytics.md",
        "plugin-sitemap": "03a-framework-apps/02-plugin-sitemap.md",
      },
    },
    {
      name: "move a task across phases while both phases renumber",
      ops: [
        { op: "phase", id: "core-bump", after: "pinion-2.0" },
        { op: "task", id: "plugin-sitemap", phase: "core-bump", after: "plugin-reading-time" },
      ],
      paths: {
        "plugin-sitemap": "01-core-bump/02-plugin-sitemap.md",
        "plugin-embeds": "01-core-bump/03-plugin-embeds.md",
        "plugin-analytics": "04-framework-apps/02-plugin-analytics.md",
      },
    },
  ])("never moves a file onto another: $name", (c) => {
    const { project } = run(c.ops);
    for (const [id, path] of Object.entries(c.paths)) expect(task(project, id).path).toBe(path);
  });

  it.each([
    { name: "phase", op: { op: "phase", id: "framework-apps", after: "canaries" } },
    { name: "task", op: { op: "task", id: "plugin-minify", after: "plugin-redirects" } },
  ])("an after that names the current spot of a $name moves and relabels nothing", (c) => {
    const { plan, project } = run([c.op]);
    expect(plan.steps.filter((s) => s.kind === "move")).toEqual([]);
    expect(project.tasks.map((t) => t.label)).toEqual(current.tasks.map((t) => t.label));
  });

  it.each([
    {
      name: "an existing task",
      ops: [{ op: "task", id: "plugin-minify", after: null }],
      id: "plugin-minify",
      path: "03a-framework-apps/01-plugin-minify.md",
      next: { id: "plugin-sitemap", label: "03a.2" },
    },
    {
      name: "a new task",
      ops: [{ op: "task", id: "new-one", phase: "canaries", title: "new one", after: null }],
      id: "new-one",
      path: "02-canaries/01-new-one.md",
      next: { id: "plugin-feed", label: "02.2" },
    },
    {
      name: "a task moved to another phase",
      ops: [{ op: "task", id: "plugin-embeds", phase: "framework-apps", after: null }],
      id: "plugin-embeds",
      path: "03a-framework-apps/01-plugin-embeds.md",
      next: { id: "plugin-sitemap", label: "03a.2" },
    },
    {
      name: "an existing phase",
      ops: [{ op: "phase", id: "cleanup", after: null }],
      id: "compat-shim",
      path: "00-cleanup/01-compat-shim.md",
      next: { id: "plan-doc", label: "01.1" },
    },
    {
      name: "a new phase",
      ops: [
        { op: "phase", id: "prework", title: "prework", after: null },
        { op: "task", id: "new-one", phase: "prework", title: "new one" },
      ],
      id: "new-one",
      path: "00-prework/01-new-one.md",
      next: { id: "plan-doc", label: "01.1" },
    },
  ])("after: null puts $name first", (c) => {
    const { project } = run(c.ops);
    expect(task(project, c.id).path).toBe(c.path);
    expect(task(project, c.next.id).label).toBe(c.next.label);
    expect(project.tasks).toHaveLength(current.tasks.length + (c.id === "new-one" ? 1 : 0));
  });

  it("after: null on an item that is already first moves nothing", () => {
    const { plan, project } = run([
      { op: "phase", id: "pinion-2.0", after: null },
      { op: "task", id: "plugin-sitemap", after: null },
    ]);
    expect(plan.steps.filter((s) => s.kind === "move")).toEqual([]);
    expect(project.tasks.map((t) => t.label)).toEqual(current.tasks.map((t) => t.label));
  });

  it("reorders a task with after and renumbers the phase", () => {
    const { project } = run([{ op: "task", id: "plugin-sitemap", after: "plugin-minify" }]);
    const phase = project.phases.find((p) => p.id === "framework-apps");
    expect(phase?.tasks.map((t) => `${t.prefix}-${t.id}`)).toEqual([
      "01-plugin-analytics",
      "02-plugin-comments",
      "03-plugin-i18n",
      "04-plugin-redirects",
      "05-plugin-minify",
      "06-plugin-sitemap",
      "07-plugin-mermaid",
    ]);
  });

  it("reorders a phase, renaming only the moved folder when the neighbours still sort", () => {
    const { plan, project, next } = run([{ op: "phase", id: "cleanup", after: "canaries" }]);
    expect(project.phases.map((p) => p.path)).toEqual([
      "00-pinion-2.0",
      "01-framework",
      "02-canaries",
      "03-cleanup",
      "03a-framework-apps",
      "03b-custom-builds",
      "03c-core-bump",
    ]);
    expect(plan.steps.filter((s) => s.kind === "remove")).toEqual([
      { kind: "remove", path: "04-cleanup" },
    ]);
    expect([...next.keys()].some((path) => path.startsWith("04-cleanup/"))).toBe(false);
    expect(task(project, "compat-shim").label).toBe("03.1");
    expect(project.tasks).toHaveLength(current.tasks.length);
  });

  it("renumbers every phase from the lowest kept prefix when a moved phase cannot fit", () => {
    const { project } = run([{ op: "phase", id: "core-bump", after: "pinion-2.0" }]);
    expect(project.phases.map((p) => p.path)).toEqual([
      "00-pinion-2.0",
      "01-core-bump",
      "02-framework",
      "03-canaries",
      "04-framework-apps",
      "05-custom-builds",
      "06-cleanup",
    ]);
  });

  it("allows blocked_by and after to name ids created in the same batch", () => {
    const { project } = run([
      {
        op: "task",
        id: "plugin-sitemap",
        status: { kind: "blocked", on: "new task", by: "new-one" },
      },
      { op: "task", id: "new-one", phase: "canaries", title: "new one", after: "plugin-feed" },
    ]);
    expect(task(project, "plugin-sitemap").status).toEqual({
      kind: "blocked",
      on: "new task",
      by: "new-one",
    });
    expect(task(project, "new-one").label).toBe("02.2");
    expect(task(project, "plugin-images").label).toBe("02.3");
  });

  it.each([
    {
      name: "bad blocked_by",
      ops: [{ op: "task", id: "plugin-sitemap", status: { kind: "blocked", on: "x", by: "nope" } }],
      error: 'blocked_by "nope"',
    },
    {
      name: "missing ask",
      ops: [{ op: "task", id: "plugin-sitemap", status: { kind: "needs-you" } }],
      error: "ask",
    },
    {
      name: "multi-line ask",
      ops: [{ op: "task", id: "plugin-sitemap", status: { kind: "needs-you", ask: "a\nb" } }],
      error: "one line",
    },
    {
      name: "new task without phase",
      ops: [{ op: "task", id: "new", title: "new" }],
      error: "needs a phase and a title",
    },
    {
      name: "new task without title",
      ops: [{ op: "task", id: "new", phase: "cleanup" }],
      error: "needs a phase and a title",
    },
    { name: "new phase without title", ops: [{ op: "phase", id: "new" }], error: "needs a title" },
    {
      name: "move to missing phase",
      ops: [{ op: "task", id: "plugin-sitemap", phase: "nope" }],
      error: 'no phase "nope"',
    },
    {
      name: "bad task after",
      ops: [{ op: "task", id: "plugin-sitemap", after: "nope" }],
      error: 'no task "nope"',
    },
    {
      name: "after in another phase",
      ops: [{ op: "task", id: "plugin-sitemap", phase: "framework-apps", after: "compat-shim" }],
      error: "is not in phase",
    },
    {
      name: "bad phase after",
      ops: [{ op: "phase", id: "cleanup", after: "nope" }],
      error: 'no phase "nope"',
    },
    {
      name: "task id taken by a phase",
      ops: [{ op: "task", id: "canaries", phase: "cleanup", title: "x" }],
      error: "already a phase",
    },
    {
      name: "unknown status kind",
      ops: [{ op: "task", id: "plugin-sitemap", status: { kind: "broken" } }],
      error: "kind",
    },
    {
      name: "extra status field",
      ops: [{ op: "task", id: "plugin-sitemap", status: { kind: "done", ask: "x" } }],
      error: "ask",
    },
    { name: "## in a log entry", ops: [], log: "## 2026", error: "heading" },
    { name: "empty log", ops: [], log: " ", error: "log" },
  ])("refuses $name", (c) => {
    const result = planApply(current, { log: c.log ?? "ok.", ops: c.ops }, NOW);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" ? result.message : "").toContain(c.error);
  });

  it("checks the whole batch: a later invalid op refuses the earlier valid ones", () => {
    const result = planApply(
      current,
      {
        log: "x.",
        ops: [
          { op: "task", id: "plugin-sitemap", status: { kind: "done" } },
          { op: "task", id: "plugin-minify", status: { kind: "blocked", on: "x", by: "ghost" } },
        ],
      },
      NOW,
    );
    expect(result).toEqual({
      kind: "error",
      message: 'task "plugin-minify": blocked_by "ghost" is not a task',
    });
  });

  it("writes temps (dot-prefixed) first, then renumber renames, then temp renames, then removes", () => {
    const { plan } = run([
      { op: "phase", id: "cleanup", after: "canaries", title: "cleanup!" },
      { op: "task", id: "compat-shim", status: { kind: "done" } },
    ]);
    const ranks = plan.steps.map(stepRank);
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
    expect(new Set(ranks)).toEqual(new Set([0, 1, 2, 3]));
    const writes = plan.steps.flatMap((step) => (step.kind === "write" ? [step.path] : []));
    expect(writes.every((path) => path.startsWith(".tmp-") && !path.includes("/"))).toBe(true);
  });
});

describe("planCreate", () => {
  it("creates project.md and an empty log.md", () => {
    const plan = planCreate(
      { slug: "new", title: "new", repo: "~/dev/new", summary: "A project." },
      NOW,
    );
    if (plan.kind === "error") throw new Error(plan.message);
    const created = executePlan(new Map(), plan);
    const project = parseProject(created);
    expect([...created.keys()].toSorted()).toEqual(["log.md", "project.md"]);
    expect(project).toMatchObject({
      summary: "A project.",
      log: [],
      progress: { percent: 0 },
      nowIn: null,
    });
    expect(plan.steps.flatMap((s) => (s.kind === "rename" ? [s.to] : []))).toEqual([
      "log.md",
      "project.md",
    ]);
  });
});
