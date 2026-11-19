import { parseProject, type Project } from "@driver/core";
import { slugOf, type FileSource, type ProjectFiles } from "./source/source.ts";

/**
 * One project as the app shows it: parsed, with its files as they are on disk for the reader, or
 * the error that kept it from parsing. An error names the file it is about, so it is shown in
 * place of that project only.
 */
export type Entry =
  | { kind: "ok"; slug: string; project: Project; files: ProjectFiles }
  | { kind: "error"; slug: string; message: string };

/**
 * Parses a project's files into an {@link Entry}. A project that fails to parse becomes an
 * error entry instead of throwing.
 *
 * @example
 * toEntry("pinion-2-plugins", files).kind; // "ok"
 * toEntry("broken", new Map()); // { kind: "error", slug: "broken", message: "missing project.md" }
 */
export function toEntry(slug: string, files: ProjectFiles): Entry {
  try {
    return { kind: "ok", slug, project: parseProject(files), files };
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
 * A project read that fails (a file renamed away mid-read) is logged and skipped: the watcher
 * starts before the first read, so the change that broke it schedules another read. Resolves to
 * a function that stops following; rejects, and stops watching, when the root cannot be listed.
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

  const readAfter = async (slug: string, previous: Promise<void>) => {
    await previous;
    const files = await source.readProject(slug);
    if (!stopped) follower.onEntry(slug, files === null ? null : toEntry(slug, files));
  };

  const read = (slug: string): Promise<void> => {
    timers.delete(slug);
    const next = readAfter(slug, reads.get(slug) ?? Promise.resolve()).catch((error: unknown) =>
      console.error(`driver: reading ${slug}`, error),
    );
    reads.set(slug, next);
    return next;
  };

  const changed = (path: string) => {
    const slug = slugOf(path);
    if (slug === null) return;
    clearTimeout(timers.get(slug));
    timers.set(
      slug,
      setTimeout(() => void read(slug), debounceMs),
    );
  };

  const unwatch = await source.watch(changed);
  const stop = () => {
    stopped = true;
    timers.forEach((timer) => clearTimeout(timer));
    unwatch();
  };

  try {
    await Promise.all((await source.slugs()).map(read));
  } catch (error) {
    stop();
    throw error;
  }
  follower.onReady();
  return stop;
}
