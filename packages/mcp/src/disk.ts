import { link, mkdir, open, readdir, rename, rm, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Step } from "@driver/core";
import { Glob } from "bun";

const RETRY_MS = 25;

/**
 * The file system under the driver root, as the MCP tools need it. Every path is relative to a
 * project directory; `slug` must already be a valid id.
 *
 * @example
 * const disk = createDisk("/Users/me/.driver", { lockTimeoutMs: 10_000 });
 * await disk.locked("pinion-2-plugins", () => disk.execute("pinion-2-plugins", plan.steps));
 */
export type Disk = {
  /** Slugs of every directory under the root that has a `project.md`, sorted. */
  projects(): Promise<string[]>;
  /** Every file of a project, keyed by relative path. Paths with a dot segment are left out. */
  readTree(slug: string): Promise<Map<string, string>>;
  /** Makes the project directory. Fails if it exists. */
  create(slug: string): Promise<void>;
  /** Runs `body` while holding `<project>/.lock`. Waits for the lock, then fails after the timeout. */
  locked<T>(slug: string, body: () => Promise<T>): Promise<T>;
  /** Runs a plan's steps in order. On failure, deletes the temps that are left and throws. */
  execute(slug: string, steps: readonly Step[]): Promise<void>;
};

type Run = {
  [K in Step["kind"]]: (dir: string, step: Extract<Step, { kind: K }>) => Promise<void>;
};

const intoPlace = async (dir: string, from: string, to: string): Promise<void> => {
  await mkdir(dirname(join(dir, to)), { recursive: true });
  await rename(join(dir, from), join(dir, to));
};

const removeFolder = async (dir: string, path: string): Promise<void> => {
  const folder = join(dir, path);
  const hidden = (await readdir(folder)).filter((name) => name.startsWith("."));
  await Promise.all(hidden.map((name) => rm(join(folder, name), { recursive: true })));
  await rmdir(folder);
};

const RUN: Run = {
  write: (dir, step) => Bun.write(join(dir, step.path), step.content).then(() => undefined),
  move: async (dir, step) => {
    await mkdir(dirname(join(dir, step.to)), { recursive: true });
    await link(join(dir, step.from), join(dir, step.to));
    await unlink(join(dir, step.from));
  },
  rename: (dir, step) => intoPlace(dir, step.from, step.to),
  remove: (dir, step) => removeFolder(dir, step.path),
};

const runStep = <K extends Step["kind"]>(dir: string, step: Extract<Step, { kind: K }>) =>
  RUN[step.kind](dir, step);

const describeStep = (step: Step): string =>
  "path" in step ? `${step.kind} ${step.path}` : `${step.kind} ${step.from} -> ${step.to}`;

const stepFailed = async (
  dir: string,
  steps: readonly Step[],
  at: { step: Step; i: number },
  error: unknown,
): Promise<never> => {
  const temps = steps.flatMap((step) => (step.kind === "write" ? [join(dir, step.path)] : []));
  await Promise.all(temps.map((path) => rm(path, { force: true })));
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(
    `step ${at.i + 1} of ${steps.length} (${describeStep(at.step)}) failed: ${reason}. The steps before it were done; temp files were deleted.`,
    { cause: error },
  );
};

const codeOf = (error: unknown): unknown =>
  error instanceof Error && "code" in error ? error.code : undefined;

const takeLock = async (path: string): Promise<boolean> => {
  try {
    await (await open(path, "wx")).close();
    return true;
  } catch (error) {
    if (codeOf(error) === "EEXIST") return false;
    if (codeOf(error) === "ENOENT")
      throw new Error(`no project at ${dirname(path)}`, { cause: error });
    throw error;
  }
};

/**
 * Makes a {@link Disk} rooted at `root`. `lockTimeoutMs` is how long a second `apply` waits for
 * the lock before it fails.
 *
 * @example
 * const disk = createDisk(join(homedir(), ".driver"), { lockTimeoutMs: 10_000 });
 * await disk.projects(); // ["driver", "pinion-2-plugins"]
 */
export function createDisk(root: string, options: { lockTimeoutMs: number }): Disk {
  const dirOf = (slug: string): string => join(root, slug);

  const lock = async (path: string, deadline: number): Promise<void> => {
    if (await takeLock(path)) return;
    if (Date.now() > deadline) {
      throw new Error(
        `${path} is still there after ${options.lockTimeoutMs}ms. If no apply is running, a crashed one left it behind; delete the file.`,
      );
    }
    await Bun.sleep(RETRY_MS);
    return lock(path, deadline);
  };

  return {
    projects: async () => {
      const entries = await readdir(root, { withFileTypes: true });
      const dirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
      const real = await Promise.all(
        dirs.map((entry) => Bun.file(join(root, entry.name, "project.md")).exists()),
      );
      return dirs
        .filter((_, i) => real[i])
        .map((entry) => entry.name)
        .toSorted();
    },

    readTree: async (slug) => {
      const dir = dirOf(slug);
      if (!(await Bun.file(join(dir, "project.md")).exists()))
        throw new Error(`no project "${slug}"`);
      const paths = await Array.fromAsync(new Glob("**").scan({ cwd: dir, dot: false }));
      const texts = await Promise.all(paths.map((path) => Bun.file(join(dir, path)).text()));
      return new Map(paths.map((path, i) => [path, texts[i] ?? ""]));
    },

    create: async (slug) => {
      try {
        await mkdir(dirOf(slug));
      } catch (error) {
        if (codeOf(error) === "EEXIST")
          throw new Error(`project "${slug}" already exists`, { cause: error });
        throw error;
      }
    },

    locked: async (slug, body) => {
      const path = join(dirOf(slug), ".lock");
      await lock(path, Date.now() + options.lockTimeoutMs);
      try {
        return await body();
      } finally {
        await unlink(path);
      }
    },

    execute: (slug, steps) => {
      const dir = dirOf(slug);
      return steps.reduce(
        (done, step, i) =>
          done.then(() =>
            runStep(dir, step).catch((error) => stepFailed(dir, steps, { step, i }, error)),
          ),
        Promise.resolve(),
      );
    },
  };
}
