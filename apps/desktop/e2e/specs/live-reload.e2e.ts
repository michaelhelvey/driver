import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";

declare global {
  interface Window {
    __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
  }
}

const SKILLS = join("pdk-2-sentry", "01-framework", "02-t4-agent-skills.md");

const root = async () => realpath(process.env["DRIVER_ROOT"] ?? "DRIVER_ROOT is not set");

const markDone = async (path: string) => {
  const text = await readFile(path, "utf8");
  const done = text.replace(/^status: .*$/m, "status: done").replace(/^ask: .*\n/m, "");
  const temp = join(path, "..", ".tmp-0-e2e.md");
  await writeFile(temp, done);
  await rename(temp, path);
};

describe("driver desktop", () => {
  it("reads the projects under DRIVER_ROOT", async () => {
    await expect($("aside")).toHaveText(expect.stringContaining(await root()));
  });

  it("reads only inside DRIVER_ROOT, and writes nowhere", async () => {
    const dir = await root();
    const calls: { cmd: string; path: string }[] = [
      { cmd: "plugin:fs|read_dir", path: dir },
      { cmd: "plugin:fs|read_dir", path: join(dir, "..") },
      { cmd: "plugin:fs|mkdir", path: join(dir, "e2e-mkdir") },
    ];
    const results = await browser.execute(
      async (attempts) =>
        Promise.all(
          attempts.map(({ cmd, path }) =>
            window["__TAURI_INTERNALS__"].invoke(cmd, { path }).then(
              () => "allowed",
              () => "denied",
            ),
          ),
        ),
      calls,
    );
    expect(results).toEqual(["allowed", "denied", "denied"]);
  });

  it("shows pdk-2-sentry at 33%", async () => {
    await browser.keys("2");
    await expect($("h1")).toHaveText("pdk-2-sentry");
    await expect($("[data-testid=headline-percent]")).toHaveText("33%");
  });

  it("follows an edit made on disk within a second, without a reload", async () => {
    await browser.keys("t");
    await expect($("html")).toHaveAttribute("data-theme", "cocoa");

    const percent = await $("[data-testid=headline-percent]").getElement();
    await markDone(join(await root(), SKILLS));
    const written = Date.now();
    await browser.waitUntil(async () => (await percent.getText()) === "37%", {
      timeout: 1000,
      interval: 25,
      timeoutMsg: "headline did not reach 37% within 1s",
    });
    const elapsed = Date.now() - written;
    console.log(`headline reached 37% ${elapsed}ms after the write`);
    expect(elapsed).toBeLessThan(1000);

    await expect($("html")).toHaveAttribute("data-theme", "cocoa");
    await expect($("main")).toHaveText(expect.stringContaining("10 of 27 tasks done"));
  });
});
