import { execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { $, $$, browser, expect } from "@wdio/globals";

declare global {
  interface Window {
    __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
  }
}

const MCP = join(import.meta.dirname, "..", "..", "..", "..", "packages", "mcp", "src", "main.ts");

const root = async () => realpath(process.env["DRIVER_ROOT"] ?? "DRIVER_ROOT is not set");

const mcp = new Client({ name: "driver-desktop-e2e", version: "0" });

const apply = async (args: Record<string, unknown>) => {
  const result = CallToolResultSchema.parse(await mcp.callTool({ name: "apply", arguments: args }));
  if (result.isError === true) throw new Error(`apply failed: ${JSON.stringify(result.content)}`);
};

const cursorRow = () => $(`main [role=listbox] [data-cursor]`);

const focusedRow = async () =>
  browser.execute(
    () => document.activeElement?.closest<HTMLElement>("[data-row]")?.dataset.row ?? null,
  );

const toast = async () =>
  browser.execute(() => document.querySelector("[aria-label=Notifications]")?.textContent);

const mermaidPath = async () =>
  join(await root(), "pinion-2-plugins", "03a-framework-apps", "07-plugin-mermaid.md");

const pasteboard = () => execFileSync("pbpaste", { encoding: "utf8" });

const expectCopied = async (key: string, text: string) => {
  await browser.keys(key);
  await browser.waitUntil(async () => (await toast())?.includes(`copied ${text}`) === true, {
    timeout: 2000,
    timeoutMsg: `no "copied ${text}" toast after ${key}`,
  });
  await browser.waitUntil(async () => pasteboard() === text, {
    timeout: 2000,
    timeoutMsg: `the system clipboard is ${JSON.stringify(pasteboard())}, not ${JSON.stringify(text)}, after ${key}`,
  });
};

before(async () => {
  await mcp.connect(
    new StdioClientTransport({
      command: "bun",
      args: [MCP],
      env: { ...getDefaultEnvironment(), DRIVER_ROOT: await root() },
      stderr: "inherit",
    }),
  );
});

after(async () => mcp.close());

const reloadedTheme = async () => {
  await browser.execute(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await browser.keys("t");
  const before = await $("html").getAttribute("data-theme");
  await browser.execute(() => {
    document.documentElement.dataset.stale = "";
  });
  await browser.refresh();
  await browser.waitUntil(async () =>
    browser.execute(
      () =>
        document.documentElement.dataset.stale === undefined &&
        document.querySelector("[data-testid=headline-percent]") !== null,
    ),
  );
  return { before, after: await $("html").getAttribute("data-theme") };
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

  it("1. shows pinion-2-plugins at 33%, with two rows that need you and one blocked", async () => {
    await browser.keys("2");
    await expect($("h1")).toHaveText("pinion-2-plugins");
    await expect($("[data-testid=headline-percent]")).toHaveText("33%");
    await expect($("main")).toHaveText(expect.stringContaining("9 of 27 tasks done · 1 skipped"));
    const glyphs = await $$(`main [data-kind="attention"] > span:nth-child(2)`).map((glyph) =>
      glyph.getText(),
    );
    expect(glyphs).toEqual(["◆", "◆", "✕"]);
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

  it("2. j then ↵ opens plugin-images in the reader, and r its raw file", async () => {
    const path = join("pinion-2-plugins", "02-canaries", "02-plugin-images.md");
    await expect(cursorRow()).toHaveAttribute("data-row", "attention:pinion-docs");
    await browser.keys("j");
    await expect(cursorRow()).toHaveAttribute("data-row", "attention:plugin-images");
    await browser.keys("Enter");
    await expect($("[data-testid=reader-path]")).toHaveText(expect.stringContaining(path));
    await expect($("[aria-label=Reader] h2")).toHaveText("plugin-images");
    await browser.keys("r");
    const raw = await readFile(join(await root(), path), "utf8");
    await expect($("[data-testid=reader-raw]")).toHaveText(raw.split("\n")[0] ?? "", {
      containing: true,
    });
    expect(await $("[data-testid=reader-raw]").getProperty("textContent")).toBe(
      raw.replace(/\n$/, ""),
    );
  });

  it("3. an MCP apply marking pinion-docs done shows within 1s, without a reload", async () => {
    const before = await $("html").getAttribute("data-theme");
    const flipped = before === "cocoa" ? "paper" : "cocoa";
    await browser.keys("t");
    await expect($("html")).toHaveAttribute("data-theme", flipped);

    const percent = await $("[data-testid=headline-percent]").getElement();
    await apply({
      slug: "pinion-2-plugins",
      log: "pinion-docs #17 merged.",
      ops: [{ op: "task", id: "pinion-docs", status: { kind: "done" } }],
    });
    const written = Date.now();
    await browser.waitUntil(async () => (await percent.getText()) === "37%", {
      timeout: 1000,
      interval: 25,
      timeoutMsg: "headline did not reach 37% within 1s of the apply",
    });
    const elapsed = Date.now() - written;
    console.log(`headline reached 37% ${elapsed}ms after the MCP apply returned`);
    expect(elapsed).toBeLessThan(1000);

    await expect($(`main [data-row="task:pinion-docs"] .text-sage`)).toHaveText("●");
    await expect($("html")).toHaveAttribute("data-theme", flipped);
    await expect($("main")).toHaveText(expect.stringContaining("10 of 27 tasks done"));
  });

  it("keeps focus on the cursor row when an MCP apply moves it to the end of its phase", async () => {
    await browser.keys(["Meta", "k"]);
    await expect($(`[role=dialog] [data-slot="command-input"]`)).toBeFocused();
    await browser.keys("plugin-sitemap".split(""));
    await browser.keys("Enter");
    await expect(cursorRow()).toHaveAttribute("data-row", "task:plugin-sitemap");
    await browser.keys("Escape");
    await expect($("[aria-label=Reader]")).not.toBeExisting();
    await browser.waitUntil(async () => (await focusedRow()) === "task:plugin-sitemap");

    await apply({
      slug: "pinion-2-plugins",
      log: "plugin-sitemap waits for the rest of its phase now.",
      ops: [{ op: "task", id: "plugin-sitemap", after: "plugin-mermaid" }],
    });
    await browser.waitUntil(
      async () =>
        (await $$(`main [data-kind="task"]`).map((row) => row.getAttribute("data-row")))
          .join(" ")
          .includes("task:plugin-mermaid task:plugin-sitemap"),
      { timeout: 1000, timeoutMsg: "plugin-sitemap did not move below plugin-mermaid" },
    );
    await browser.waitUntil(async () => (await focusedRow()) === "task:plugin-sitemap", {
      timeout: 1000,
      timeoutMsg: "focus left plugin-sitemap when it moved",
    });
    await browser.keys("k");
    await expect(cursorRow()).toHaveAttribute("data-row", "task:plugin-mermaid");
  });

  it("y writes the cursor row's absolute path to the system clipboard", async () => {
    await expectCopied("y", await mermaidPath());
  });

  it("c writes a reference to the cursor row, with its absolute path, to the system clipboard", async () => {
    await expectCopied("c", `re plugin-mermaid (plugin-mermaid): ${await mermaidPath()}`);
  });

  it("cannot read the clipboard back", async () => {
    const read = await browser.execute(async () =>
      window["__TAURI_INTERNALS__"].invoke("plugin:clipboard-manager|read_text", {}).then(
        () => "allowed",
        (error: unknown) => String(error),
      ),
    );
    expect(read).toContain("not allowed");
  });

  it("closes the reader when its handle collapses it, so the next activate opens it", async () => {
    await browser.keys("Enter");
    await expect($("[aria-label=Reader]")).toBeExisting();
    await browser.execute(() =>
      document.querySelector<HTMLElement>(`[aria-label="Resize reader"]`)?.focus(),
    );
    await browser.keys("Enter");
    await expect($("[aria-label=Reader]")).not.toBeExisting();
    await $(`main [data-kind="attention"]`).click();
    await expect($("[aria-label=Reader]")).toBeExisting();
  });

  it("keeps the t theme across a reload", async () => {
    const first = await reloadedTheme();
    const second = await reloadedTheme();
    await browser.keys("t");
    expect([first.after, second.after]).toEqual([first.before, second.before]);
    expect(second.before).not.toBe(first.before);
  });
});
