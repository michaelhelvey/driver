import { describe, expect, it } from "bun:test";
import { followProjects, type Entry } from "../src/projects.ts";
import { memorySource } from "../src/source/memory.ts";
import { fixtureTree, sleep, withStatus } from "./fixtures.ts";

const SKILLS = "pinion-2-plugins/01-framework/02-pinion-docs.md";

const follow = async () => {
  const tree = await fixtureTree();
  const source = memorySource("fixtures", tree);
  const entries = new Map<string, Entry | null>();
  const reads: string[] = [];
  const readProject = source.readProject;
  source.readProject = (slug) => {
    reads.push(slug);
    return readProject(slug);
  };
  const stop = await followProjects(
    source,
    { onEntry: (slug, entry) => entries.set(slug, entry), onReady: () => {} },
    20,
  );
  reads.length = 0;
  return { tree, source, entries, reads, stop };
};

const percentOf = (entry: Entry | null | undefined) =>
  entry?.kind === "ok" ? entry.project.progress.percent : entry?.kind;

describe("followProjects", () => {
  it("reads every project", async () => {
    const { entries, stop } = await follow();
    expect([...entries.keys()].toSorted()).toEqual([
      "billing-ledger-v2",
      "driver",
      "onboarding-docs",
      "pinion-2-plugins",
    ]);
    expect(percentOf(entries.get("pinion-2-plugins"))).toBe(33);
    stop();
  });

  it("re-reads only the changed project, once per burst of changes", async () => {
    const { tree, source, entries, reads, stop } = await follow();
    const text = tree.get(SKILLS) ?? "";
    source.write(SKILLS, withStatus(text, "doing"));
    source.write(SKILLS, withStatus(text, "done"));
    source.write("pinion-2-plugins/.lock", "");
    await sleep(60);
    expect(reads).toEqual(["pinion-2-plugins"]);
    expect(percentOf(entries.get("pinion-2-plugins"))).toBe(37);
    stop();
  });

  it.each([
    [
      "a file that does not parse",
      "pinion-2-plugins/log.md",
      "no frontmatter",
      "log.md: no frontmatter",
    ],
    ["an unknown file", "pinion-2-plugins/notes.md", "hi", "unknown file notes.md"],
  ])("shows %s as an error of that project only", async (_, path, text, message) => {
    const { source, entries, stop } = await follow();
    source.write(path, text);
    await sleep(60);
    expect(entries.get("pinion-2-plugins")).toEqual({
      kind: "error",
      slug: "pinion-2-plugins",
      message,
    });
    expect(entries.get("driver")?.kind).toBe("ok");
    stop();
  });

  it("drops a project whose directory is gone", async () => {
    const { tree, source, entries, stop } = await follow();
    for (const path of tree.keys()) {
      if (path.startsWith("driver/")) source.remove(path);
    }
    await sleep(60);
    expect(entries.get("driver")).toBeNull();
    stop();
  });

  it("skips a project whose first read fails mid-write, then reads it on the next change", async () => {
    const tree = await fixtureTree();
    const source = memorySource("fixtures", tree);
    const readProject = source.readProject;
    let failures = 1;
    source.readProject = async (slug) => {
      if (slug === "pinion-2-plugins" && failures-- > 0) throw new Error("ENOENT mid-rename");
      return readProject(slug);
    };
    const entries = new Map<string, Entry | null>();
    let ready = false;
    const stop = await followProjects(
      source,
      { onEntry: (slug, entry) => entries.set(slug, entry), onReady: () => (ready = true) },
      20,
    );
    expect({ ready, slugs: [...entries.keys()].toSorted() }).toEqual({
      ready: true,
      slugs: ["billing-ledger-v2", "driver", "onboarding-docs"],
    });

    source.write(SKILLS, withStatus(tree.get(SKILLS) ?? "", "done"));
    await sleep(60);
    expect(percentOf(entries.get("pinion-2-plugins"))).toBe(37);
    stop();
  });

  it("stops watching when the root cannot be listed", async () => {
    const source = memorySource("fixtures", await fixtureTree());
    let watching = 0;
    const watch = source.watch;
    source.watch = async (onChange) => {
      watching += 1;
      const unwatch = await watch(onChange);
      return () => {
        watching -= 1;
        unwatch();
      };
    };
    source.slugs = async () => {
      throw new Error("EACCES");
    };
    const following = followProjects(source, { onEntry: () => {}, onReady: () => {} });
    expect(await following.then(() => "resolved").catch(String)).toBe("Error: EACCES");
    expect(watching).toBe(0);
  });

  it("has no projects when the root is empty", async () => {
    const entries: string[] = [];
    let ready = false;
    const stop = await followProjects(memorySource("empty", new Map()), {
      onEntry: (slug) => entries.push(slug),
      onReady: () => (ready = true),
    });
    expect({ entries, ready }).toEqual({ entries: [], ready: true });
    stop();
  });
});
