import type { Phase, Project, Task } from "@driver/core";

/**
 * One row of a project page's keyboard list. `key` is unique within the page and stable across
 * re-reads, so the cursor stays on its row when files change. M4 adds the project header,
 * attention and log rows as more kinds.
 */
export type Row =
  | { kind: "phase"; key: `phase:${string}`; phase: Phase }
  | { kind: "task"; key: `task:${string}`; task: Task };

/**
 * The rows of a project page in core's order: each phase's header, then its tasks.
 *
 * @example
 * rowsOf(project).map((row) => row.key);
 * // ["phase:pdk-2.0", "task:plan-doc", "task:extension-crate", …, "phase:framework", …]
 */
export function rowsOf(project: Project): Row[] {
  return project.phases.flatMap((phase): Row[] => [
    { kind: "phase", key: `phase:${phase.id}`, phase },
    ...phase.tasks.map((task): Row => ({ kind: "task", key: `task:${task.id}`, task })),
  ]);
}
