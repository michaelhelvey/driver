import { parseProject, type Project } from "@driver/core";
import { slugOf, type FileSource, type ProjectFiles } from "./source/source.ts";

/**
 * One project as the app shows it: parsed, or the error that kept it from parsing. An error
 * names the file it is about, so it is shown in place of that project only.
 */
export type Entry =
  | { kind: "ok"; slug: string; project: Project }
  | { kind: "error"; slug: string; message: string };

/**
 * Parses a project's files into an {@link Entry}. A project that fails to parse becomes an
 * error entry instead of throwing.
 *
 * @example
 * toEntry("pdk-2-sentry", files).kind; // "ok"
 * toEntry("broken", new Map()); // { kind: "error", slug: "broken", message: "missing project.md" }
 */
export function toEntry(slug: string, files: ProjectFiles): Entry {
  try {
    return { kind: "ok", slug, project: parseProject(files) };
  } catch (error) {
    return { kind: "error", slug, message: error instanceof Error ? error.message : String(error) };
  }
}

/** What {@link followProjects} reports. */
export type Follower = {
  /** A project was read: its new entry, or `null` when its directory is gone. */
  onEntry: (slug: string, entry: Entry | null) => void;
  /** The first full read finished. */
  onReady: () => void;
};

/**
 * Reads every project of `source`, then keeps them current. A change to a project's files
 * re-reads that project only, once `debounceMs` pass with no further change to it. Reads of one
 * project run in order, so a slow read never overwrites a newer one.
 *
 * Resolves to a function that stops following.
 *
 * @example
 * const stop = await followProjects(source, {
 *   onEntry: (slug, entry) => console.log(slug, entry?.kind ?? "gone"),
 *   onReady: () => console.log("loaded"),
 * });
 */
export async function followProjects(
  source: FileSource,
  follower: Follower,
  debounceMs = 100,
): Promise<() => void> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const reads = new Map<string, Promise<void>>();
  let stopped = false;
  let ready: Promise<void> = Promise.resolve();

  const readAfter = async (slug: string, previous: Promise<void>) => {
    await previous;
    const files = await source.readProject(slug);
    if (!stopped) follower.onEntry(slug, files === null ? null : toEntry(slug, files));
  };

  const reread = (slug: string) => {
    timers.delete(slug);
    const next = readAfter(slug, reads.get(slug) ?? ready);
    reads.set(
      slug,
      next.catch((error: unknown) => console.error(`driver: reading ${slug}`, error)),
    );
  };

  const readAll = async () => {
    const tree = await source.readTree();
    if (stopped) return;
    tree.forEach((files, slug) => follower.onEntry(slug, toEntry(slug, files)));
    follower.onReady();
  };

  const changed = (path: string) => {
    const slug = slugOf(path);
    if (slug === null) return;
    clearTimeout(timers.get(slug));
    timers.set(
      slug,
      setTimeout(() => reread(slug), debounceMs),
    );
  };

  const unwatch = await source.watch(changed);
  ready = readAll();
  await ready;

  return () => {
    stopped = true;
    timers.forEach((timer) => clearTimeout(timer));
    unwatch();
  };
}
