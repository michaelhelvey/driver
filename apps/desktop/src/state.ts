import { createMemo, createSignal, onSettled, type Accessor } from "solid-js";
import { followProjects, type Entry } from "./projects.ts";
import type { FileSource } from "./source/source.ts";

/** The app's view of the root directory, kept current by {@link createProjects}. */
export type Projects = {
  /** Every project, most recently updated first (projects that do not parse last). */
  list: Accessor<Entry[]>;
  /** Whether the first read finished. */
  ready: Accessor<boolean>;
  /** Why the root could not be read at all, if it could not. */
  failure: Accessor<string | null>;
};

const updatedOf = (entry: Entry) => (entry.kind === "ok" ? entry.project.updated : "");

const byRecent = (a: Entry, b: Entry) =>
  updatedOf(b).localeCompare(updatedOf(a)) || a.slug.localeCompare(b.slug);

/**
 * Follows every project of `source` for the life of the calling component.
 *
 * @example
 * const projects = createProjects(() => props.source);
 * <For each={projects.list()}>{(entry) => <p>{entry.slug}</p>}</For>
 */
export function createProjects(source: () => FileSource): Projects {
  const [entries, setEntries] = createSignal<ReadonlyMap<string, Entry>>(new Map(), {
    name: "entries",
  });
  const [ready, setReady] = createSignal(false, { name: "ready" });
  const [failure, setFailure] = createSignal<string | null>(null, { name: "failure" });

  const put = (slug: string, entry: Entry | null) =>
    setEntries((previous) => {
      const next = new Map(previous);
      if (entry === null) next.delete(slug);
      else next.set(slug, entry);
      return next;
    });

  onSettled(() => {
    const following = followProjects(source(), { onEntry: put, onReady: () => setReady(true) });
    following.catch((error: unknown) => {
      console.error("driver: reading the root", error);
      setFailure(error instanceof Error ? error.message : String(error));
    });
    return () =>
      void following.then(
        (stop) => stop(),
        () => {},
      );
  });

  const list = createMemo(() => [...entries().values()].toSorted(byRecent), { name: "list" });
  return { list, ready, failure };
}
