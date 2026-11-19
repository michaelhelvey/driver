import { join } from "node:path";
import { Glob } from "bun";
import type { Project, Task } from "../src/index.ts";

/**
 * Finds a task by id, or throws.
 *
 * @example
 * taskOf(project, "t4-coa").label; // "03a.1"
 */
export function taskOf(project: Project, id: string): Task {
  const task = project.tasks.find((candidate) => candidate.id === id);
  if (task === undefined) throw new Error(`no task ${id}`);
  return task;
}

/**
 * Reads every file of a fixture project into the path-to-content map that `parseProject` takes.
 *
 * @example
 * const files = await loadFixture("pdk-2-sentry");
 */
export async function loadFixture(slug: string): Promise<Map<string, string>> {
  const root = join(import.meta.dir, "..", "fixtures", slug);
  const paths = await Array.fromAsync(new Glob("**/*.md").scan({ cwd: root }));
  const texts = await Promise.all(paths.map((path) => Bun.file(join(root, path)).text()));
  return new Map(paths.map((path, i) => [path, texts[i] ?? ""]));
}
