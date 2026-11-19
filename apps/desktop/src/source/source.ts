/** Every file of one project: paths relative to the project directory, to their text. */
export type ProjectFiles = Map<string, string>;

/**
 * Where the app reads projects from. The real app reads the disk through Tauri; browser dev and
 * tests use an in-memory tree.
 *
 * @example
 * const source = memorySource("/fixtures", files);
 * const tree = await source.readTree(); // Map { "pdk-2-sentry" => Map { "project.md" => "---…" } }
 * const stop = await source.watch((path) => console.log("changed", path));
 */
export type FileSource = {
  /** The root directory, for display. */
  readonly root: string;
  /** Reads every project under the root. A missing root has no projects. */
  readTree: () => Promise<Map<string, ProjectFiles>>;
  /** Reads one project, or `null` when its directory is gone. */
  readProject: (slug: string) => Promise<ProjectFiles | null>;
  /**
   * Calls `onChange` with the path, relative to the root, of every file or directory that
   * changes. Resolves to a function that stops watching.
   */
  watch: (onChange: (path: string) => void) => Promise<() => void>;
};

const HIDDEN = /(^|\/)\./;

/**
 * The project slug a changed path belongs to, or `null` for paths no reader looks at: the root
 * itself and anything with a segment that starts with a dot (`.lock`, `.tmp-*`).
 *
 * @example
 * slugOf("pdk-2-sentry/01-framework/phase.md"); // "pdk-2-sentry"
 * slugOf("pdk-2-sentry/.lock"); // null
 */
export function slugOf(path: string): string | null {
  const slug = path.split("/")[0] ?? "";
  return slug === "" || HIDDEN.test(path) ? null : slug;
}

/**
 * Reads every project of `slugs` with `read`, dropping the ones that vanished mid-read.
 *
 * @example
 * await readEach(["a", "b"], source.readProject); // Map { "a" => …, "b" => … }
 */
export async function readEach(
  slugs: readonly string[],
  read: (slug: string) => Promise<ProjectFiles | null>,
): Promise<Map<string, ProjectFiles>> {
  const projects = await Promise.all(slugs.map(async (slug) => [slug, await read(slug)] as const));
  return new Map(projects.filter((entry): entry is [string, ProjectFiles] => entry[1] !== null));
}
