import { isHidden } from "@driver/core";

/** Every file of one project: paths relative to the project directory, to their text. */
export type ProjectFiles = Map<string, string>;

/**
 * Where the app reads projects from. The real app reads the disk through Tauri; browser dev and
 * tests use an in-memory tree.
 *
 * @example
 * const source = memorySource("/fixtures", files);
 * await source.slugs(); // ["driver", "pinion-2-plugins"]
 * await source.readProject("driver"); // Map { "project.md" => "---…", … }
 * const stop = await source.watch((path) => console.log("changed", path));
 */
export type FileSource = {
  /** The root directory, for display. */
  readonly root: string;
  /** Lists the slugs of the projects under the root. A missing root has no projects. */
  slugs: () => Promise<string[]>;
  /** Reads one project, or `null` when its directory is gone. */
  readProject: (slug: string) => Promise<ProjectFiles | null>;
  /**
   * Calls `onChange` with the path, relative to the root, of every file or directory that
   * changes. Resolves to a function that stops watching.
   */
  watch: (onChange: (path: string) => void) => Promise<() => void>;
};

/**
 * The project slug a changed path belongs to, or `null` for paths no reader looks at: the root
 * itself and anything with a segment that starts with a dot (`.lock`, `.tmp-*`).
 *
 * @example
 * slugOf("pinion-2-plugins/01-framework/phase.md"); // "pinion-2-plugins"
 * slugOf("pinion-2-plugins/.lock"); // null
 */
export function slugOf(path: string): string | null {
  const slug = path.split("/")[0] ?? "";
  return slug === "" || isHidden(path) ? null : slug;
}
