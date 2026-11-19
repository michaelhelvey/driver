import { describe, expect, it } from "bun:test";
import { followProjects, type Entry } from "../src/projects.ts";
import { memorySource } from "../src/source/memory.ts";
import { fixtureTree, sleep, withStatus } from "./fixtures.ts";

const SKILLS = "pdk-2-sentry/01-framework/02-t4-agent-skills.md";

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
    expect([...entries.keys()].toSorted()).toEqual(["driver", "pdk-2-sentry"]);
    expect(percentOf(entries.get("pdk-2-sentry"))).toBe(33);
    stop();
  });

  it("re-reads only the changed project, once per burst of changes", async () => {
    const { tree, source, entries, reads, stop } = await follow();
    const text = tree.get(SKILLS) ?? "";
    source.write(SKILLS, withStatus(text, "doing"));
    source.write(SKILLS, withStatus(text, "done"));
    source.write("pdk-2-sentry/.lock", "");
    await sleep(60);
    expect(reads).toEqual(["pdk-2-sentry"]);
    expect(percentOf(entries.get("pdk-2-sentry"))).toBe(37);
    stop();
  });

  it.each([
    [
      "a file that does not parse",
      "pdk-2-sentry/log.md",
      "no frontmatter",
      "log.md: no frontmatter",
    ],
    ["an unknown file", "pdk-2-sentry/notes.md", "hi", "unknown file notes.md"],
  ])("shows %s as an error of that project only", async (_, path, text, message) => {
    const { source, entries, stop } = await follow();
    source.write(path, text);
    await sleep(60);
    expect(entries.get("pdk-2-sentry")).toEqual({ kind: "error", slug: "pdk-2-sentry", message });
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
