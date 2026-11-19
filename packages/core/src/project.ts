import {
  countSteps,
  fail,
  flattenStatus,
  parseAt,
  readDoc,
  readLog,
  readStatus,
  splitSummary,
  writeDoc,
  writeLog,
} from "./format.ts";
import {
  ID_PATTERN,
  IdSchema,
  LogFrontmatterSchema,
  PhaseFrontmatterSchema,
  ProjectFrontmatterSchema,
  TaskFrontmatterSchema,
  type LogEntry,
  type ProjectFrontmatter,
  type Status,
} from "./schemas.ts";
import type { Progress } from "./tools.ts";

/** A task as stored on disk. `prefix` is the `NN` of its file name. */
export type TaskData = {
  id: string;
  prefix: string;
  title: string;
  status: Status;
  repo?: string | undefined;
  pr?: string | undefined;
  updated: string;
  body: string;
};

/** A phase as stored on disk, with its tasks in order. */
export type PhaseData = {
  id: string;
  prefix: string;
  title: string;
  body: string;
  tasks: TaskData[];
};

/** A project as stored on disk. `summary` is the text of `project.md` before the first `## `. */
export type ProjectData = {
  meta: ProjectFrontmatter;
  summary: string;
  body: string;
  phases: PhaseData[];
  log: LogEntry[];
};

/** A task with its derived values. `label` is display only, e.g. `03a.1`. */
export type Task = TaskData & {
  phase: string;
  label: string;
  path: string;
  steps: { done: number; total: number };
};

/**
 * A phase with its derived values. `path` is its folder, `note` the first line of its body, and
 * `progress` counts its own tasks the way the project's does.
 */
export type Phase = Omit<PhaseData, "tasks"> & {
  label: string;
  path: string;
  note: string;
  tasks: Task[];
  progress: Progress;
};

/**
 * A parsed project with its derived values. `updated` is the newest timestamp in its files,
 * `nowIn` the id of the first phase with a task that is not `done` or `skipped`, and `log` is
 * oldest first.
 */
export type Project = Omit<ProjectData, "phases"> & {
  phases: Phase[];
  tasks: Task[];
  updated: string;
  progress: Progress;
  nowIn: string | null;
  needsYou: Task[];
  blocked: Task[];
};

const HIDDEN = /(^|\/)\./;

/**
 * Whether readers ignore `path`: it has a segment that starts with a dot (`.lock`, `.tmp-*`,
 * `.DS_Store`). Paths use `/`.
 *
 * @example
 * isHidden("pinion-2-plugins/.tmp-0-log.md"); // true
 * isHidden("pinion-2-plugins/log.md"); // false
 */
export function isHidden(path: string): boolean {
  return HIDDEN.test(path);
}

const PREFIX = "\\d+[a-z]?";
const ROOT_PATH = /^(project|log)\.md$/;
const PHASE_PATH = new RegExp(`^(${PREFIX})-(${ID_PATTERN})/phase\\.md$`);
const TASK_PATH = new RegExp(`^(${PREFIX})-(${ID_PATTERN})/(${PREFIX})-(${ID_PATTERN})\\.md$`);
const CLOSED = new Set<Status["kind"]>(["done", "skipped"]);

/**
 * Orders `NN` prefixes by number, then by letter: `03` < `03a` < `03b` < `04`.
 *
 * @example
 * ["04", "03b", "03a"].toSorted(comparePrefix); // ["03a", "03b", "04"]
 */
export function comparePrefix(a: string, b: string): number {
  return Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b);
}

const byPrefix = (a: { prefix: string }, b: { prefix: string }): number =>
  comparePrefix(a.prefix, b.prefix);

const firstById = <T>(items: readonly T[], id: (item: T) => string, taken: Set<string>): T[] =>
  items.filter((item) => !taken.has(id(item)) && Boolean(taken.add(id(item))));

const readPhase = (path: string, text: string, match: RegExpExecArray): PhaseData => {
  const [, prefix = "", id = ""] = match;
  const { data, body } = readDoc(path, text, PhaseFrontmatterSchema);
  return { id: parseAt(path, IdSchema, id), prefix, title: data.title, body, tasks: [] };
};

const readTask = (path: string, text: string, match: RegExpExecArray) => {
  const [, , phase = "", prefix = "", id = ""] = match;
  const { data, body } = readDoc(path, text, TaskFrontmatterSchema);
  const { title, repo, pr, updated } = data;
  const status = readStatus(path, data);
  const task: TaskData = {
    id: parseAt(path, IdSchema, id),
    prefix,
    title,
    status,
    repo,
    pr,
    updated,
    body,
  };
  return { phase, task };
};

const matching = <T>(
  files: ReadonlyMap<string, string>,
  paths: readonly string[],
  pattern: RegExp,
  read: (path: string, text: string, match: RegExpExecArray) => T,
): T[] =>
  paths.flatMap((path) => {
    const match = pattern.exec(path);
    return match === null ? [] : [read(path, files.get(path) ?? "", match)];
  });

/**
 * Parses the files of one project directory into a {@link Project}. `files` maps paths relative to
 * the project directory to their contents. Paths with a segment that starts with `.` are ignored.
 * When an id shows up twice (a read during a rename), the first path in sorted order wins.
 * Throws an `Error` that names the file for anything else that is not in the file format.
 *
 * @example
 * const project = parseProject(new Map([
 *   ["project.md", "---\ntitle: a\nrepo: ~/a\nstarted: 2026-11-19\nupdated: 2026-11-19T07:00:00Z\n---\nSummary."],
 *   ["log.md", "---\ntitle: log\n---\n"],
 * ]));
 * project.progress.percent; // 0
 */
export function parseProject(files: ReadonlyMap<string, string>): Project {
  const paths = [...files.keys()].filter((path) => !isHidden(path)).toSorted();
  const unknown = paths.filter(
    (path) => ![ROOT_PATH, PHASE_PATH, TASK_PATH].some((r) => r.test(path)),
  );
  const text = (path: string) => files.get(path) ?? fail(`missing ${path}`);
  const { data: meta, body } = readDoc("project.md", text("project.md"), ProjectFrontmatterSchema);
  const log = readLog("log.md", readDoc("log.md", text("log.md"), LogFrontmatterSchema).body);
  const taken = new Set<string>();
  const phases = matching(files, paths, PHASE_PATH, readPhase);
  const tasks = matching(files, paths, TASK_PATH, readTask);
  const kept = firstById(phases, (phase) => phase.id, taken).toSorted(byPrefix);
  const placed = firstById(tasks, (t) => t.task.id, taken);
  const orphans = placed.filter((t) => !kept.some((p) => p.id === t.phase));
  const problems = [
    ...unknown.map((p) => `unknown file ${p}`),
    ...orphans.map((t) => `no phase.md for ${t.phase}`),
  ];
  for (const phase of kept) {
    phase.tasks = placed.filter((t) => t.phase === phase.id).map((t) => t.task);
    phase.tasks.sort(byPrefix);
  }
  return problems.length === 0
    ? derive({ meta, ...splitSummary(body), log, phases: kept })
    : fail(problems.join("\n"));
}

const percent = (done: number, total: number): number =>
  total === 0 ? 0 : Math.floor((done * 100) / total);

const progressOf = (tasks: readonly Task[]): Progress => {
  const done = tasks.filter((task) => task.status.kind === "done").length;
  const skipped = tasks.filter((task) => task.status.kind === "skipped").length;
  const total = tasks.length - skipped;
  return { done, total, skipped, percent: percent(done, total) };
};

const deriveTask = (phase: PhaseData, task: TaskData): Task => ({
  ...task,
  phase: phase.id,
  label: `${phase.prefix}.${task.prefix.replace(/^0+(?=.)/, "")}`,
  path: `${phase.prefix}-${phase.id}/${task.prefix}-${task.id}.md`,
  steps: countSteps(task.body),
});

/**
 * Adds the derived values (labels, paths, step counts, progress, "now in", needs-you and blocked
 * lists, newest `updated`) to stored project data.
 *
 * @example
 * derive(data).progress; // { done: 9, total: 27, skipped: 1, percent: 33 }
 */
export function derive(data: ProjectData): Project {
  const phases = data.phases.map((phase): Phase => {
    const tasks = phase.tasks.map((task) => deriveTask(phase, task));
    return {
      ...phase,
      label: phase.prefix,
      path: `${phase.prefix}-${phase.id}`,
      note: phase.body.split("\n")[0] ?? "",
      tasks,
      progress: progressOf(tasks),
    };
  });
  const tasks = phases.flatMap((phase) => phase.tasks);
  const stamps = [data.meta.updated, ...tasks.map((t) => t.updated), ...data.log.map((e) => e.at)];
  return {
    ...data,
    phases,
    tasks,
    updated: stamps.toSorted().at(-1) ?? data.meta.updated,
    progress: progressOf(tasks),
    nowIn: phases.find((phase) => phase.tasks.some((t) => !CLOSED.has(t.status.kind)))?.id ?? null,
    needsYou: tasks.filter((task) => task.status.kind === "needs-you"),
    blocked: tasks.filter((task) => task.status.kind === "blocked"),
  };
}

/**
 * Maps every ref of a project to its file path: `"project"`, `"log"`, phase ids (their
 * `phase.md`), and task ids.
 *
 * @example
 * refPaths(project).get("plugin-sitemap"); // "03a-framework-apps/01-plugin-sitemap.md"
 */
export function refPaths(project: Project): Map<string, string> {
  return new Map([
    ["project", "project.md"],
    ["log", "log.md"],
    ...project.phases.map((phase): [string, string] => [phase.id, `${phase.path}/phase.md`]),
    ...project.tasks.map((task): [string, string] => [task.id, task.path]),
  ]);
}

/**
 * Writes every file of a project, keyed by ref (see {@link refPaths}), in canonical form.
 *
 * @example
 * renderFiles(project).get("log"); // "---\ntitle: log\n---\n\n## 2026-..."
 */
export function renderFiles(project: Project): Map<string, string> {
  const summary = [project.summary, project.body].filter((part) => part !== "").join("\n\n");
  return new Map([
    ["project", writeDoc(project.meta, summary)],
    ["log", writeDoc({ title: "log" }, writeLog(project.log))],
    ...project.phases.map((p): [string, string] => [p.id, writeDoc({ title: p.title }, p.body)]),
    ...project.tasks.map((task): [string, string] => [task.id, writeTask(task)]),
  ]);
}

const writeTask = (task: Task): string => {
  const { title, repo, pr, updated } = task;
  return writeDoc({ title, ...flattenStatus(task.status), repo, pr, updated }, task.body);
};
