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

  it("runs no inline script, and allows the inline styles ui-sdk injects", async () => {
    const result = await browser.execute(() => {
      const script = document.createElement("script");
      script.textContent = "document.documentElement.dataset.injected = 'ran'";
      document.head.append(script);
      const style = document.createElement("style");
      style.textContent = "body { outline-offset: 7px; }";
      document.head.append(style);
      const applied = getComputedStyle(document.body).outlineOffset;
      style.remove();
      script.remove();
      return { injected: document.documentElement.dataset.injected ?? "blocked", applied };
    });
    expect(result).toEqual({ injected: "blocked", applied: "7px" });
  });

  it("shows pdk-2-sentry at 33%", async () => {
    await browser.keys("2");
    await expect($("h1")).toHaveText("pdk-2-sentry");
    await expect($("[data-testid=headline-percent]")).toHaveText("33%");
  });

  it("renders under the CSP: the stylesheet, the font by name, and the grain", async () => {
    const page = await browser.execute(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      berkeley: document.fonts.check(`13px "Berkeley Mono"`),
      grain: getComputedStyle(document.body, "::after").backgroundImage.split(",")[0],
      theme: document.documentElement.dataset.theme,
    }));
    console.log(`page under the CSP: ${JSON.stringify(page)}`);
    expect(page.background).toMatch(/^rgb\((244, 237, 225|29, 25, 21)\)$/);
    expect(page.font).toContain("Berkeley Mono");
    expect(page.grain).toBe(`url("data:image/svg+xml;utf8`);
  });

  it("follows an edit made on disk within a second, without a reload", async () => {
    const before = await $("html").getAttribute("data-theme");
    const flipped = before === "cocoa" ? "paper" : "cocoa";
    await browser.keys("t");
    await expect($("html")).toHaveAttribute("data-theme", flipped);

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

    await expect($("html")).toHaveAttribute("data-theme", flipped);
    await expect($("main")).toHaveText(expect.stringContaining("10 of 27 tasks done"));
  });

  it("opens the cursor row in the reader, rendered and raw", async () => {
    const path = join("pdk-2-sentry", "02-canaries", "02-t4-authorization-platform.md");
    await $(`main [data-kind="attention"]`).click();
    await expect($("[data-testid=reader-path]")).toHaveText(expect.stringContaining(path));
    await expect($("[aria-label=Reader] h2")).toHaveText("t4-authorization-platform");
    await browser.keys("r");
    const raw = await readFile(join(await root(), path), "utf8");
    await expect($("[data-testid=reader-raw]")).toHaveText(raw.split("\n")[0] ?? "", {
      containing: true,
    });
    expect(await $("[data-testid=reader-raw]").getProperty("textContent")).toBe(
      raw.replace(/\n$/, ""),
    );
  });

  it("closes the reader when its handle collapses it, so the next activate opens it", async () => {
    await browser.execute(() =>
      document.querySelector<HTMLElement>(`[aria-label="Resize reader"]`)?.focus(),
    );
    await browser.keys("Enter");
    await expect($("[aria-label=Reader]")).not.toBeExisting();
    await $(`main [data-kind="attention"]`).click();
    await expect($("[aria-label=Reader]")).toBeExisting();
  });
});
