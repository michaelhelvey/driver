import { describe, expect, it } from "bun:test";
import {
  parseProject,
  readFrontmatter,
  refPaths,
  renderFiles,
  renderListProjects,
  renderNeedsMe,
  renderProject,
  type Project,
} from "../src/index.ts";
import { loadFixture, taskOf } from "./fixtures.ts";

type ProjectCase = {
  name: string;
  project: Project;
  progress: Project["progress"];
  nowIn: string;
  updated: string;
  phases: string[];
  needsYou: string[];
  blocked: string[];
};

const pdk = parseProject(await loadFixture("pdk-2-sentry"));
const base = await loadFixture("driver");
const driver = parseProject(base);
const billing = parseProject(await loadFixture("billing-ledger-v2"));
const onboarding = parseProject(await loadFixture("onboarding-docs"));

describe("parseProject on fixtures", () => {
  it.each<ProjectCase>([
    {
      name: "pdk-2-sentry",
      project: pdk,
      progress: { done: 9, total: 27, skipped: 1, percent: 33 },
      nowIn: "framework",
      updated: "2026-11-19T07:38:00Z",
      phases: [
        "00:pdk-2.0 8/8",
        "01:framework 1/3",
        "02:canaries 0/2",
        "03a:framework-apps 0/7",
        "03b:custom-builds 0/3",
        "03c:pdk-bump 0/3",
        "04:cleanup 0/1",
      ],
      needsYou: ["t4-agent-skills", "t4-authorization-platform"],
      blocked: ["t4-user-info"],
    },
    {
      name: "driver",
      project: driver,
      progress: { done: 2, total: 6, skipped: 0, percent: 33 },
      nowIn: "prototype",
      updated: "2026-11-19T07:39:00Z",
      phases: ["01:file-format 2/2", "02:prototype 0/2", "03:mcp 0/2"],
      needsYou: ["keymap"],
      blocked: [],
    },
    {
      name: "billing-ledger-v2",
      project: billing,
      progress: { done: 2, total: 5, skipped: 0, percent: 40 },
      nowIn: "schema",
      updated: "2026-11-19T06:58:00Z",
      phases: ["01:discovery 1/1", "02:schema 1/2", "03:cutover 0/2"],
      needsYou: ["pr-backfill"],
      blocked: ["reconcile-job", "read-flag"],
    },
    {
      name: "onboarding-docs",
      project: onboarding,
      progress: { done: 1, total: 3, skipped: 0, percent: 33 },
      nowIn: "drafts",
      updated: "2026-11-14T10:00:00Z",
      phases: ["01:outline 1/1", "02:drafts 0/2"],
      needsYou: [],
      blocked: [],
    },
  ])("$name: derived values", (c) => {
    expect(c.project.progress).toEqual(c.progress);
    expect(c.project.nowIn).toBe(c.nowIn);
    expect(c.project.updated).toBe(c.updated);
    expect(
      c.project.phases.map((p) => `${p.label}:${p.id} ${p.progress.done}/${p.progress.total}`),
    ).toEqual(c.phases);
    expect(c.project.needsYou.map((t) => t.id)).toEqual(c.needsYou);
    expect(c.project.blocked.map((t) => t.id)).toEqual(c.blocked);
  });

  it.each([
    { project: pdk, id: "plan-doc", label: "00.1", steps: "6/6", kind: "done" },
    { project: pdk, id: "cloudwatch-log-loss", label: "00.9", steps: "2/3", kind: "skipped" },
    { project: pdk, id: "t4-agent-skills", label: "01.2", steps: "1/3", kind: "needs-you" },
    {
      project: pdk,
      id: "t4-authorization-platform",
      label: "02.2",
      steps: "4/9",
      kind: "needs-you",
    },
    { project: pdk, id: "t4-coa", label: "03a.1", steps: "0/6", kind: "todo" },
    { project: pdk, id: "t4-nip-review", label: "03b.3", steps: "0/5", kind: "todo" },
    { project: pdk, id: "t4-user-info", label: "03c.2", steps: "0/4", kind: "blocked" },
    { project: pdk, id: "ssm-alias", label: "04.1", steps: "0/3", kind: "todo" },
    { project: driver, id: "html-prototype", label: "02.1", steps: "3/4", kind: "doing" },
    { project: driver, id: "fs-watch", label: "03.2", steps: "0/0", kind: "todo" },
    { project: billing, id: "pr-backfill", label: "02.2", steps: "1/2", kind: "needs-you" },
    { project: billing, id: "reconcile-job", label: "03.1", steps: "0/0", kind: "blocked" },
    { project: onboarding, id: "first-deploy", label: "02.2", steps: "0/0", kind: "todo" },
  ])("task $id is $label with $steps steps", (c) => {
    const task = taskOf(c.project, c.id);
    expect(task.label).toBe(c.label);
    expect(`${task.steps.done}/${task.steps.total}`).toBe(c.steps);
    expect(task.status.kind).toBe(c.kind);
  });

  it("reads the flat status fields into the tagged union", () => {
    expect(taskOf(pdk, "t4-authorization-platform").status).toEqual({
      kind: "needs-you",
      ask: "authorizer cold start +290ms — keep 500ms reserve, or drop to 200ms?",
    });
    expect(taskOf(pdk, "t4-user-info").status).toEqual({
      kind: "blocked",
      on: "is CT-597-lambda merging soon? asked in #platform",
    });
  });

  it.each([
    { name: "pdk-2-sentry", project: pdk },
    { name: "driver", project: driver },
    { name: "billing-ledger-v2", project: billing },
    { name: "onboarding-docs", project: onboarding },
  ])("$name: writing the parsed project reproduces every file byte for byte", async (c) => {
    const files = await loadFixture(c.name);
    const paths = refPaths(c.project);
    const written = new Map(
      [...renderFiles(c.project)].map(([ref, text]) => [paths.get(ref) ?? ref, text]),
    );
    expect(written).toEqual(files);
  });

  it("splits the summary from the rest of project.md and the log oldest first", () => {
    expect(pdk.summary).toStartWith("Moving every lambda");
    expect(pdk.summary).not.toContain("## ");
    expect(pdk.body).toStartWith("## the done rule");
    expect(pdk.log.map((e) => e.at)).toEqual(pdk.log.map((e) => e.at).toSorted());
    expect(pdk.log).toHaveLength(6);
  });
});

describe("readFrontmatter", () => {
  it.each<{ name: string; path: string; keys: string[]; pr: string | undefined }>([
    {
      name: "a task, in file order with quotes undone",
      path: "02-canaries/02-t4-authorization-platform.md",
      keys: ["title", "status", "ask", "repo", "pr", "updated"],
      pr: "#204",
    },
    { name: "a phase", path: "02-canaries/phase.md", keys: ["title"], pr: undefined },
    { name: "the log", path: "log.md", keys: ["title"], pr: undefined },
  ])("reads $name", async (c) => {
    const text = (await loadFixture("pdk-2-sentry")).get(c.path) ?? "";
    const { data, body } = readFrontmatter(c.path, text);
    expect(Object.keys(data)).toEqual(c.keys);
    expect(data["pr"]).toBe(c.pr);
    expect(text.endsWith(`${body}\n`)).toBe(true);
  });

  it("names the file it cannot read", () => {
    expect(() => readFrontmatter("01-a/01-b.md", "no frontmatter")).toThrow("01-a/01-b.md");
  });
});

describe("parseProject on transient and bad trees", () => {
  const withFiles = (extra: Record<string, string>) => new Map([...base, ...Object.entries(extra)]);

  it.each([
    { name: "lock file", path: ".lock", text: "" },
    { name: "temp file", path: ".tmp-0-01-frontmatter.md", text: "garbage" },
    { name: "temp in a phase", path: "02-prototype/.tmp-3-02-keymap.md", text: "garbage" },
    { name: "hidden folder", path: ".git/HEAD", text: "ref" },
    { name: "Finder file", path: "02-prototype/.DS_Store", text: "\u0000" },
  ])("ignores a $name", (c) => {
    expect(parseProject(withFiles({ [c.path]: c.text })).progress).toEqual(driver.progress);
  });

  it("keeps the first copy of an id seen at its old and new path mid-rename", () => {
    const keymap = base.get("02-prototype/02-keymap.md") ?? "";
    const project = parseProject(withFiles({ "02-prototype/03-keymap.md": keymap }));
    expect(project.tasks.filter((t) => t.id === "keymap").map((t) => t.label)).toEqual(["02.2"]);
    expect(project.tasks).toHaveLength(driver.tasks.length);
  });

  it.each([
    { name: "unknown file", path: "notes.txt", text: "x", error: "unknown file notes.txt" },
    {
      name: "task without phase.md",
      path: "09-x/01-y.md",
      text: base.get("03-mcp/02-fs-watch.md") ?? "",
      error: "no phase.md for x",
    },
    {
      name: "needs-you without ask",
      path: "03-mcp/03-z.md",
      text: "---\ntitle: z\nstatus: needs-you\nupdated: 2026-11-19T06:00:00Z\n---\n",
      error: "03-mcp/03-z.md",
    },
    {
      name: "field of another status",
      path: "03-mcp/03-z.md",
      text: "---\ntitle: z\nstatus: todo\nwhy: no\nupdated: 2026-11-19T06:00:00Z\n---\n",
      error: "why",
    },
  ])("throws on a $name", (c) => {
    expect(() => parseProject(withFiles({ [c.path]: c.text }))).toThrow(c.error);
  });
});

describe("render", () => {
  it("get_project shows the 10 newest log entries newest first, without bodies", () => {
    const out = renderProject("pdk-2-sentry", pdk);
    expect(out.log[0]?.at).toBe("2026-11-19T07:38:00Z");
    expect(out.phases[3]?.tasks[0]).toEqual({
      id: "t4-coa",
      label: "03a.1",
      title: "t4-coa",
      status: { kind: "todo" },
      steps: "0/6",
      repo: "t4-coa",
      pr: undefined,
    });
    expect(out.phases[2]?.note).toStartWith("Two repos that together");
  });

  it("list_projects and needs_me cover every project", () => {
    const projects = new Map([
      ["pdk-2-sentry", pdk],
      ["driver", driver],
    ]);
    expect(
      renderListProjects(projects).projects.map((p) => [p.slug, p.percent, p.needsYou, p.blocked]),
    ).toEqual([
      ["pdk-2-sentry", 33, 2, 1],
      ["driver", 33, 1, 0],
    ]);
    expect(renderNeedsMe(projects).tasks.map((t) => `${t.project}/${t.id}`)).toEqual([
      "pdk-2-sentry/t4-agent-skills",
      "pdk-2-sentry/t4-authorization-platform",
      "pdk-2-sentry/t4-user-info",
      "driver/keymap",
    ]);
  });
});
