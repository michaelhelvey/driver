import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisk } from "../src/disk.ts";

let root = "";
const dir = () => join(root, "p");
const disk = () => createDisk(root, { lockTimeoutMs: 150 });
const put = (path: string, text: string) => Bun.write(join(dir(), path), text);
const text = (path: string) => Bun.file(join(dir(), path)).text();
const failure = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => "resolved",
    (error: unknown) => String(error),
  );
const listing = async () => (await readdir(dir(), { recursive: true })).toSorted();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "driver-disk-"));
  await mkdir(dir());
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe("disk", () => {
  it("runs write, move, rename, and remove in order, and removes a folder that only has dot-files", async () => {
    await put("01-a/phase.md", "a");
    await put("01-a/.DS_Store", "finder");
    await disk().execute("p", [
      { kind: "write", path: ".tmp-0-phase.md", content: "a2" },
      { kind: "move", from: "01-a/phase.md", to: "02-a/phase.md" },
      { kind: "rename", from: ".tmp-0-phase.md", to: "02-a/phase.md" },
      { kind: "remove", path: "01-a" },
    ]);
    expect(await listing()).toEqual(["02-a", "02-a/phase.md"]);
    expect(await text("02-a/phase.md")).toBe("a2");
  });

  it("refuses a move onto an existing file, names the step, and deletes the temps", async () => {
    await put("a.md", "a");
    await put("b.md", "b");
    const run = disk().execute("p", [
      { kind: "write", path: ".tmp-0-a.md", content: "new" },
      { kind: "move", from: "a.md", to: "b.md" },
    ]);
    expect(await failure(run)).toContain("step 2 of 2 (move a.md -> b.md) failed");
    expect(await listing()).toEqual(["a.md", "b.md"]);
    expect(await text("b.md")).toBe("b");
  });

  it("refuses to remove a folder that still has a real file", async () => {
    await put("01-a/phase.md", "a");
    expect(await failure(disk().execute("p", [{ kind: "remove", path: "01-a" }]))).toContain(
      "(remove 01-a) failed",
    );
  });

  it("serializes lock holders and releases the lock after a throw", async () => {
    const order: string[] = [];
    const hold = (name: string, fail: boolean) =>
      disk().locked("p", async () => {
        order.push(`${name} in`);
        await Bun.sleep(30);
        order.push(`${name} out`);
        if (fail) throw new Error(name);
      });
    const results = await Promise.allSettled([hold("a", true), hold("b", false)]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    const [first, second] = [order[0]?.split(" ")[0], order[2]?.split(" ")[0]];
    expect(order).toEqual([`${first} in`, `${first} out`, `${second} in`, `${second} out`]);
    expect(first).not.toBe(second);
    expect(await listing()).toEqual([]);
  });

  it("fails with the lock path when a stale lock outlives the timeout", async () => {
    await put(".lock", "");
    expect(await failure(disk().locked("p", async () => undefined))).toContain(
      `${join(dir(), ".lock")} is still there after 150ms`,
    );
  });

  it("refuses to create a project that exists, and lists only folders with a project.md", async () => {
    expect(await failure(disk().create("p"))).toContain('project "p" already exists');
    await mkdir(join(root, ".tmp-x"));
    await put("project.md", "x");
    await mkdir(join(root, "empty"));
    expect(await disk().projects()).toEqual(["p"]);
  });
});
