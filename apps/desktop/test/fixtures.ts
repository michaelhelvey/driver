import { join } from "node:path";
import { Glob } from "bun";

const FIXTURES = join(import.meta.dir, "..", "..", "..", "packages", "core", "fixtures");

/**
 * Reads every fixture project from `packages/core/fixtures` into the `<slug>/<path>` to text map
 * that `memorySource` takes.
 *
 * @example
 * const source = memorySource("fixtures", await fixtureTree());
 */
export async function fixtureTree(): Promise<Map<string, string>> {
  const paths = await Array.fromAsync(new Glob("*/**/*.md").scan({ cwd: FIXTURES }));
  const texts = await Promise.all(paths.map((path) => Bun.file(join(FIXTURES, path)).text()));
  return new Map(paths.map((path, i) => [path, texts[i] ?? ""]));
}

/**
 * Sets the frontmatter `status:` line of a task file, dropping the fields of the old status.
 *
 * @example
 * withStatus(text, "done"); // "---\ntitle: …\nstatus: done\n…"
 */
export function withStatus(text: string, status: string): string {
  return text
    .replace(/^status: .*$/m, `status: ${status}`)
    .replace(/^(ask|blocked_on|blocked_by|why): .*\n/gm, "");
}

/** Resolves after `ms` milliseconds. */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once `read()` returns `want`, checking every 10ms, or rejects with the last value
 * after `ms` milliseconds.
 *
 * @example
 * await until(() => percentShown(), "37", 1000);
 */
export async function until<T>(read: () => T, want: T, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms;
  while (read() !== want) {
    if (Date.now() > deadline) throw new Error(`expected ${String(want)}, got ${String(read())}`);
    // oxlint-disable-next-line no-await-in-loop
    await sleep(10);
  }
}
