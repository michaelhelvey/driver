import { readEach, type FileSource, type ProjectFiles } from "./source.ts";

/** A {@link FileSource} over an in-memory tree that can be changed, like a disk an agent writes to. */
export type MemorySource = FileSource & {
  /** Writes a file (path relative to the root) and reports the change to watchers. */
  write: (path: string, text: string) => void;
  /** Removes a file and reports the change to watchers. */
  remove: (path: string) => void;
};

/**
 * Makes an in-memory {@link FileSource}. `files` maps paths relative to the root
 * (`<slug>/<path in project>`) to their text.
 *
 * @example
 * const source = memorySource("fixtures", new Map([["a/project.md", "---\n…"]]));
 * source.write("a/log.md", "---\ntitle: log\n---\n"); // watchers hear "a/log.md"
 */
export function memorySource(root: string, files: ReadonlyMap<string, string>): MemorySource {
  const tree = new Map(files);
  const watchers = new Set<(path: string) => void>();
  const changed = (path: string) => watchers.forEach((watcher) => watcher(path));

  const readProject = async (slug: string): Promise<ProjectFiles | null> => {
    const prefix = `${slug}/`;
    const own = [...tree].filter(([path]) => path.startsWith(prefix));
    return own.length === 0
      ? null
      : new Map(own.map(([path, text]) => [path.slice(prefix.length), text]));
  };

  return {
    root,
    readProject,
    readTree: async () =>
      readEach([...new Set([...tree.keys()].map((path) => path.split("/")[0] ?? ""))], readProject),
    watch: async (onChange) => {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    write: (path, text) => {
      tree.set(path, text);
      changed(path);
    },
    remove: (path) => {
      tree.delete(path);
      changed(path);
    },
  };
}
