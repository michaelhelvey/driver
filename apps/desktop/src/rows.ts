import type { Phase, Project, Task } from "@driver/core";

/**
 * One row of a project page's keyboard list, in page order: the project header, the tasks that
 * need the user or are blocked, the recent log, then each phase's header and its tasks. `key` is
 * unique within the page and stable across re-reads, so the cursor stays on its row when files
 * change. `path` is the file the reader shows for the row, relative to the project directory.
 */
export type Row =
  | { kind: "project"; key: "project"; path: "project.md" }
  | { kind: "attention"; key: `attention:${string}`; path: string; task: Task }
  | { kind: "log"; key: "log"; path: "log.md" }
  | { kind: "phase"; key: `phase:${string}`; path: string; phase: Phase }
  | { kind: "task"; key: `task:${string}`; path: string; task: Task };

/** A row of one kind. */
export type RowOf<K extends Row["kind"]> = Extract<Row, { kind: K }>;

const attention = (task: Task): Row => ({
  kind: "attention",
  key: `attention:${task.id}`,
  path: task.path,
  task,
});

const phaseRows = (phase: Phase): Row[] => [
  { kind: "phase", key: `phase:${phase.id}`, path: `${phase.path}/phase.md`, phase },
  ...phase.tasks.map((task): Row => ({
    kind: "task",
    key: `task:${task.id}`,
    path: task.path,
    task,
  })),
];

/**
 * Every row of a project page, folded or not, in page order.
 *
 * @example
 * rowsOf(project).map((row) => row.key);
 * // ["project", "attention:t4-agent-skills", …, "log", "phase:pdk-2.0", "task:plan-doc", …]
 */
export function rowsOf(project: Project): Row[] {
  return [
    { kind: "project", key: "project", path: "project.md" },
    ...project.needsYou.map(attention),
    ...project.blocked.map(attention),
    ...(project.log.length === 0 ? [] : [{ kind: "log", key: "log", path: "log.md" } as const]),
    ...project.phases.flatMap(phaseRows),
  ];
}

/**
 * Whether every task of a phase is `done` or `skipped`. Such a phase starts folded.
 *
 * @example
 * isFinished(project.phases[0]); // true for pdk-2-sentry's "00 pdk 2.0"
 */
export function isFinished(phase: Phase): boolean {
  return phase.tasks.every((task) => task.status.kind === "done" || task.status.kind === "skipped");
}

/**
 * The id of the phase a row folds: a phase header's own, or a task's phase.
 *
 * @example
 * phaseIdOf(rows.find((row) => row.key === "task:t4-coa")); // "framework-apps"
 */
export function phaseIdOf(row: Row): string | undefined {
  if (row.kind === "phase") return row.phase.id;
  return row.kind === "task" ? row.task.phase : undefined;
}

/** Whether the phase with this id is folded. */
export type Folded = (phaseId: string) => boolean;

const hidden = (row: Row, folded: Folded) => row.kind === "task" && folded(row.task.phase);

/**
 * The rows the cursor can be on: every row but the tasks of folded phases.
 *
 * @example
 * visibleRows(rowsOf(project), (id) => id === "pdk-2.0").some((row) => row.key === "task:plan-doc"); // false
 */
export function visibleRows(rows: readonly Row[], folded: Folded): Row[] {
  return rows.filter((row) => !hidden(row, folded));
}

const phaseOf = (rows: readonly Row[], row: Row): Row | undefined =>
  row.kind === "task" ? rows.find((r) => r.key === `phase:${row.task.phase}`) : undefined;

const fallback = (rows: readonly Row[]): Row | undefined =>
  rows.find((row) => row.kind === "attention") ?? rows[0];

/**
 * The row the cursor is on. A key that is gone falls back to the first row that needs the user
 * (or the first row), and a task in a folded phase to its phase header.
 *
 * @example
 * cursorRow(rows, null, () => false)?.key; // "attention:t4-agent-skills"
 * cursorRow(rows, "task:plan-doc", (id) => id === "pdk-2.0")?.key; // "phase:pdk-2.0"
 */
export function cursorRow(
  rows: readonly Row[],
  key: string | null,
  folded: Folded,
): Row | undefined {
  const row = rows.find((candidate) => candidate.key === key) ?? fallback(rows);
  return row !== undefined && hidden(row, folded) ? phaseOf(rows, row) : row;
}
