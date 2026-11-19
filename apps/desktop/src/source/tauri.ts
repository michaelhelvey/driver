import { invoke } from "@tauri-apps/api/core";
import {
  exists,
  readDir,
  readTextFile,
  watchImmediate,
  type WatchEvent,
} from "@tauri-apps/plugin-fs";
import { z } from "zod";
import { readEach, type FileSource, type ProjectFiles } from "./source.ts";

const isHidden = (name: string) => name.startsWith(".");

const isAccess = (event: WatchEvent) => typeof event.type === "object" && "access" in event.type;

const walk = async (dir: string, prefix = ""): Promise<[string, string][]> => {
  const entries = (await readDir(dir)).filter((entry) => !isHidden(entry.name));
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${dir}/${entry.name}`;
      const rel = `${prefix}${entry.name}`;
      return entry.isDirectory
        ? walk(path, `${rel}/`)
        : [[rel, await readTextFile(path)] as [string, string]];
    }),
  );
  return nested.flat();
};

/**
 * Makes the {@link FileSource} of the real app: the root directory the Rust side reports
 * (`DRIVER_ROOT`, else `$HOME/.driver`), read and watched through `tauri-plugin-fs`.
 *
 * @example
 * const source = await tauriSource();
 * source.root; // "/Users/me/.driver"
 */
export async function tauriSource(): Promise<FileSource> {
  const root = z.string().parse(
    await invoke("root").catch((error: unknown) => {
      throw new Error(String(error));
    }),
  );

  const readProject = async (slug: string): Promise<ProjectFiles | null> => {
    const dir = `${root}/${slug}`;
    return (await exists(dir)) ? new Map(await walk(dir)) : null;
  };

  const slugs = async () =>
    (await exists(root))
      ? (await readDir(root)).filter((e) => e.isDirectory && !isHidden(e.name)).map((e) => e.name)
      : [];

  return {
    root,
    readProject,
    readTree: async () => readEach(await slugs(), readProject),
    watch: async (onChange) => {
      if (!(await exists(root))) return () => {};
      return watchImmediate(
        root,
        (event) => {
          if (isAccess(event)) return;
          for (const path of event.paths) {
            if (path.startsWith(`${root}/`)) onChange(path.slice(root.length + 1));
          }
        },
        { recursive: true },
      );
    },
  };
}
