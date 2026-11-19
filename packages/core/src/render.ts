import { fail } from "./format.ts";
import { refPaths, type Project, type Task } from "./project.ts";
import type { GetProjectOutput, ListProjectsOutput, NeedsMeOutput, ReadOutput } from "./tools.ts";

const RECENT_LOG = 10;

const taskView = (task: Task) => ({
  id: task.id,
  label: task.label,
  title: task.title,
  status: task.status,
  steps: `${task.steps.done}/${task.steps.total}`,
  repo: task.repo,
  pr: task.pr,
});

/**
 * The `list_projects` output for a set of parsed projects, keyed by slug.
 *
 * @example
 * renderListProjects(new Map([["pdk-2-sentry", project]])).projects[0]?.percent; // 33
 */
export function renderListProjects(projects: ReadonlyMap<string, Project>): ListProjectsOutput {
  return {
    projects: [...projects].map(([slug, project]) => ({
      slug,
      title: project.meta.title,
      percent: project.progress.percent,
      needsYou: project.needsYou.length,
      blocked: project.blocked.length,
      updated: project.updated,
    })),
  };
}

/**
 * The `get_project` output: everything but task bodies, with the 10 newest log entries, newest
 * first.
 *
 * @example
 * renderProject("pdk-2-sentry", project).phases[4]?.tasks[0]?.label; // "03a.1"
 */
export function renderProject(slug: string, project: Project): GetProjectOutput {
  const { title, repo, started } = project.meta;
  return {
    slug,
    title,
    repo,
    started,
    updated: project.updated,
    summary: project.summary,
    progress: project.progress,
    nowIn: project.nowIn,
    phases: project.phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      title: phase.title,
      note: phase.note,
      tasks: phase.tasks.map(taskView),
    })),
    log: project.log.toReversed().slice(0, RECENT_LOG),
  };
}

/**
 * The `needs_me` output: every `needs-you` and `blocked` task across projects, keyed by slug.
 *
 * @example
 * renderNeedsMe(new Map([["pdk-2-sentry", project]])).tasks.map((t) => t.id);
 * // ["t4-agent-skills", "t4-authorization-platform", "t4-user-info"]
 */
export function renderNeedsMe(projects: ReadonlyMap<string, Project>): NeedsMeOutput {
  return {
    tasks: [...projects].flatMap(([slug, project]) =>
      [...project.needsYou, ...project.blocked].map((task) => ({
        project: slug,
        id: task.id,
        label: task.label,
        title: task.title,
        status: task.status,
      })),
    ),
  };
}

/**
 * The `read` output: the raw text of each ref, in the order asked. Throws an `Error` for an
 * unknown ref.
 *
 * @example
 * renderRead(project, files, ["log"]).files[0]?.path; // "log.md"
 */
export function renderRead(
  project: Project,
  files: ReadonlyMap<string, string>,
  refs: readonly string[],
): ReadOutput {
  const paths = refPaths(project);
  return {
    files: refs.map((ref) => {
      const path = paths.get(ref) ?? fail(`no task or phase "${ref}"`);
      return { ref, path, content: files.get(path) ?? fail(`missing ${path}`) };
    }),
  };
}
