import { z } from "zod";
import { fail, stamp } from "./format.ts";
import {
  comparePrefix,
  derive,
  refPaths,
  renderFiles,
  type PhaseData,
  type Project,
  type ProjectData,
  type TaskData,
} from "./project.ts";
import { ApplyInputSchema, type ApplyInput } from "./schemas.ts";
import { CreateProjectInputSchema } from "./tools.ts";

/**
 * One step of the on-disk write protocol (see `docs/plan.md`). Paths are relative to the project
 * directory.
 *
 * - `write`: write `content` to the temp file `path`.
 * - `rename`: move `from` to `to`, creating the parent folder of `to`. Replaces `to`.
 * - `remove`: delete the folder `path`, which is empty by then.
 */
export type Step =
  | { kind: "write"; path: string; content: string }
  | { kind: "rename"; from: string; to: string }
  | { kind: "remove"; path: string };

/**
 * A checked change: the steps to run in order while holding `<project>/.lock`, and the project as
 * it will be after them.
 */
export type Plan = { kind: "plan"; steps: Step[]; project: Project; changed: string[] };

/** Why a change was refused. Nothing is written. */
export type ApplyError = { kind: "error"; message: string };

type ProjectOp = Extract<ApplyInput["ops"][number], { op: "project" }>;
type PhaseOp = Extract<ApplyInput["ops"][number], { op: "phase" }>;
type TaskOp = Extract<ApplyInput["ops"][number], { op: "task" }>;

type Draft = {
  data: ProjectData;
  now: string;
  moved: Set<string>;
  touched: Set<string>;
};

class Invalid extends Error {}

const refuse = (message: string): never => {
  throw new Invalid(message);
};

const check = (ok: boolean, message: string): void => {
  if (!ok) refuse(message);
};

const findPhase = (draft: Draft, id: string): PhaseData | undefined =>
  draft.data.phases.find((phase) => phase.id === id);

const findTask = (draft: Draft, id: string): { phase: PhaseData; task: TaskData } | undefined =>
  draft.data.phases
    .flatMap((phase) => phase.tasks.map((task) => ({ phase, task })))
    .find((found) => found.task.id === id);

const isTaken = (draft: Draft, id: string): boolean =>
  findPhase(draft, id) !== undefined || findTask(draft, id) !== undefined;

const takeOut = <T extends { id: string }>(items: T[], id: string): T => {
  const [item] = items.splice(
    items.findIndex((candidate) => candidate.id === id),
    1,
  );
  return item ?? fail(`no "${id}" to move`);
};

const putAfter = <T extends { id: string }>(items: T[], after: string, item: T): void => {
  items.splice(items.findIndex((candidate) => candidate.id === after) + 1, 0, item);
};

const applyProjectOp = (draft: Draft, op: ProjectOp): void => {
  const { op: _op, ...fields } = op;
  Object.assign(draft.data, fields);
  draft.data.meta.updated = draft.now;
  draft.touched.add("project");
};

const createPhase = (draft: Draft, op: PhaseOp): PhaseData => {
  check(op.title !== undefined, `new phase "${op.id}" needs a title`);
  check(!isTaken(draft, op.id), `id "${op.id}" is already a task`);
  const phase = { id: op.id, prefix: "", title: "", body: "", tasks: [] };
  draft.data.phases.push(phase);
  draft.moved.add(op.id);
  return phase;
};

const applyPhaseOp = (draft: Draft, op: PhaseOp): void => {
  const phase = findPhase(draft, op.id) ?? createPhase(draft, op);
  const { op: _op, id: _id, after: _after, ...fields } = op;
  Object.assign(phase, fields);
  draft.touched.add(op.id);
};

const createTask = (draft: Draft, op: TaskOp): { phase: PhaseData; task: TaskData } => {
  check(
    op.phase !== undefined && op.title !== undefined,
    `new task "${op.id}" needs a phase and a title`,
  );
  check(!isTaken(draft, op.id), `id "${op.id}" is already a phase`);
  const phase =
    findPhase(draft, op.phase ?? "") ?? refuse(`task "${op.id}": no phase "${op.phase}"`);
  const task: TaskData = {
    id: op.id,
    prefix: "",
    title: "",
    status: { kind: "todo" },
    updated: draft.now,
    body: "",
  };
  phase.tasks.push(task);
  draft.moved.add(op.id);
  return { phase, task };
};

const moveTask = (draft: Draft, from: PhaseData, task: TaskData, to: string): void => {
  const phase = findPhase(draft, to) ?? refuse(`task "${task.id}": no phase "${to}"`);
  phase.tasks.push(takeOut(from.tasks, task.id));
  draft.moved.add(task.id);
};

const applyTaskOp = (draft: Draft, op: TaskOp): void => {
  const { phase, task } = findTask(draft, op.id) ?? createTask(draft, op);
  const { op: _op, id: _id, after: _after, phase: target = phase.id, ...fields } = op;
  if (target !== phase.id) moveTask(draft, phase, task, target);
  Object.assign(task, fields, { updated: draft.now });
  draft.touched.add(op.id);
};

const placePhase = (draft: Draft, id: string, after: string): void => {
  check(
    after !== id && findPhase(draft, after) !== undefined,
    `phase "${id}": no phase "${after}" to go after`,
  );
  putAfter(draft.data.phases, after, takeOut(draft.data.phases, id));
  draft.moved.add(id);
};

const placeTask = (draft: Draft, op: TaskOp, after: string): void => {
  check(after !== op.id, `task "${op.id}" cannot go after itself`);
  const target =
    findTask(draft, after) ?? refuse(`task "${op.id}": no task "${after}" to go after`);
  check(
    op.phase === undefined || op.phase === target.phase.id,
    `task "${op.id}": "${after}" is not in phase "${op.phase}"`,
  );
  const self = findTask(draft, op.id) ?? fail(`no task "${op.id}"`);
  putAfter(target.phase.tasks, after, takeOut(self.phase.tasks, op.id));
  draft.moved.add(op.id);
};

const pad = (n: number): string => String(n).padStart(2, "0");

const succ = (last: string | undefined): string =>
  pad(last === undefined ? 1 : Number.parseInt(last, 10) + 1);

const fill = (
  items: readonly { id: string; prefix: string }[],
  moved: ReadonlySet<string>,
): string[] => {
  const prefixes: string[] = [];
  for (const item of items) prefixes.push(moved.has(item.id) ? succ(prefixes.at(-1)) : item.prefix);
  return prefixes;
};

const isIncreasing = (prefixes: readonly string[]): boolean =>
  prefixes.every((prefix, i) => i === 0 || comparePrefix(prefixes[i - 1] ?? "", prefix) < 0);

const renumber = (items: { id: string; prefix: string }[], moved: ReadonlySet<string>): void => {
  const kept = fill(items, moved);
  const stay = items
    .filter((item) => !moved.has(item.id))
    .map((item) => Number.parseInt(item.prefix, 10));
  const base = Math.min(1, ...stay);
  const prefixes = isIncreasing(kept) ? kept : items.map((_, i) => pad(base + i));
  items.forEach((item, i) => {
    item.prefix = prefixes[i] ?? fail("prefix count");
  });
};

const blockers = (project: Project): string[] => {
  const ids = new Set(project.tasks.map((task) => task.id));
  return project.tasks.flatMap((task) =>
    task.status.kind === "blocked" && task.status.by !== undefined && !ids.has(task.status.by)
      ? [`task "${task.id}": blocked_by "${task.status.by}" is not a task`]
      : [],
  );
};

const folder = (path: string): string => path.split("/")[0] ?? path;

const temp = (i: number, path: string): string => `.tmp-${i}-${path.split("/").at(-1) ?? path}`;

const steps = (before: Map<string, string>, after: Project, refs: ReadonlySet<string>): Plan => {
  const paths = refPaths(after);
  const files = renderFiles(after);
  const changed = [...refs].map(
    (ref) => [paths.get(ref) ?? fail(`no path for ${ref}`), files.get(ref) ?? ""] as const,
  );
  const moves = [...paths].flatMap(([ref, to]) => {
    const from = before.get(ref);
    return from === undefined || from === to ? [] : [{ kind: "rename" as const, from, to }];
  });
  const folders = new Set([...paths.values()].map(folder));
  const gone = new Set([...before.values()].map(folder).filter((dir) => !folders.has(dir)));
  return {
    kind: "plan",
    project: after,
    changed: [
      ...new Set([...changed.map(([path]) => path), ...moves.map((move) => move.to)]),
    ].toSorted(),
    steps: [
      ...changed.map(([path, content], i): Step => ({
        kind: "write",
        path: temp(i, path),
        content,
      })),
      ...moves,
      ...changed.map(([to], i): Step => ({ kind: "rename", from: temp(i, to), to })),
      ...[...gone].map((path): Step => ({ kind: "remove", path })),
    ],
  };
};

const plan = (current: Project, input: ApplyInput, now: string): Plan => {
  const draft: Draft = {
    data: structuredClone(current),
    now,
    moved: new Set(),
    touched: new Set(["log"]),
  };
  const of = <K extends ApplyInput["ops"][number]["op"]>(kind: K) =>
    input.ops.filter((op): op is Extract<ApplyInput["ops"][number], { op: K }> => op.op === kind);
  of("project").forEach((op) => applyProjectOp(draft, op));
  of("phase").forEach((op) => applyPhaseOp(draft, op));
  of("task").forEach((op) => applyTaskOp(draft, op));
  of("phase").forEach((op) => op.after !== undefined && placePhase(draft, op.id, op.after));
  of("task").forEach((op) => op.after !== undefined && placeTask(draft, op, op.after));
  renumber(draft.data.phases, draft.moved);
  draft.data.phases.forEach((phase) => renumber(phase.tasks, draft.moved));
  draft.data.log.push({ at: now, text: input.log });
  const next = derive(draft.data);
  const problems = blockers(next);
  return problems.length === 0
    ? steps(refPaths(current), next, draft.touched)
    : refuse(problems.join("\n"));
};

const guard = (run: () => Plan): Plan | ApplyError => {
  try {
    return run();
  } catch (error) {
    if (error instanceof Invalid) return { kind: "error", message: error.message };
    throw error;
  }
};

/**
 * Checks an `apply` batch against `current` and returns the steps that write it, or why it was
 * refused. The whole batch is validated against the result state; nothing touches the disk.
 * `input` is validated with {@link ApplyInputSchema}. `now` becomes the `updated` of every changed
 * file and the timestamp of the new log entry.
 *
 * @example
 * const result = planApply(project, {
 *   log: "t4-agent-skills merged as #31.",
 *   ops: [{ op: "task", id: "t4-agent-skills", status: { kind: "done" } }],
 * }, new Date());
 * if (result.kind === "plan") result.project.progress.percent; // 37
 */
export function planApply(current: Project, input: unknown, now: Date): Plan | ApplyError {
  const parsed = ApplyInputSchema.safeParse(input);
  return parsed.success
    ? guard(() => plan(current, parsed.data, stamp(now)))
    : { kind: "error", message: z.prettifyError(parsed.error) };
}

/**
 * Returns the steps that create a new project: `project.md` and an empty `log.md`. `input` is
 * validated with {@link CreateProjectInputSchema}. The caller checks that the slug is free.
 *
 * @example
 * planCreate({ slug: "driver", title: "driver", repo: "~/dev/driver", summary: "A tracker." }, new Date());
 */
export function planCreate(input: unknown, now: Date): Plan | ApplyError {
  const parsed = CreateProjectInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: z.prettifyError(parsed.error) };
  const { title, repo, rex, summary } = parsed.data;
  const at = stamp(now);
  const meta = { title, repo, rex, started: at.slice(0, 10), updated: at };
  const project = derive({ meta, summary, body: "", phases: [], log: [] });
  return steps(new Map(), project, new Set(["project", "log"]));
}

const rename = (files: Map<string, string>, from: string, to: string): void => {
  files.set(to, files.get(from) ?? fail(`rename: no ${from}`));
  files.delete(from);
};

const runStep = (files: Map<string, string>, step: Step): void => {
  switch (step.kind) {
    case "write":
      files.set(step.path, step.content);
      return;
    case "rename":
      rename(files, step.from, step.to);
      return;
    case "remove":
      check(
        [...files.keys()].every((path) => !path.startsWith(`${step.path}/`)),
        `remove: ${step.path} is not empty`,
      );
  }
};

/**
 * Runs a plan's steps against an in-memory file map and returns the new map. The MCP server runs
 * the same steps against the disk.
 *
 * @example
 * const next = executePlan(files, plan);
 * parseProject(next).progress.percent; // 37
 */
export function executePlan(files: ReadonlyMap<string, string>, plan: Plan): Map<string, string> {
  const next = new Map(files);
  plan.steps.forEach((step) => runStep(next, step));
  return next;
}
