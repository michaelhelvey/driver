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

  it("1. shows pdk-2-sentry at 33%, with two rows that need you and one blocked", async () => {
    await browser.keys("2");
    await expect($("h1")).toHaveText("pdk-2-sentry");
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

  it("2. j then ↵ opens t4-authorization-platform in the reader, and r its raw file", async () => {
    const path = join("pdk-2-sentry", "02-canaries", "02-t4-authorization-platform.md");
    await expect(cursorRow()).toHaveAttribute("data-row", "attention:t4-agent-skills");
    await browser.keys("j");
    await expect(cursorRow()).toHaveAttribute("data-row", "attention:t4-authorization-platform");
    await browser.keys("Enter");
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

  it("3. an MCP apply marking t4-agent-skills done shows within 1s, without a reload", async () => {
    const before = await $("html").getAttribute("data-theme");
    const flipped = before === "cocoa" ? "paper" : "cocoa";
    await browser.keys("t");
    await expect($("html")).toHaveAttribute("data-theme", flipped);

    const percent = await $("[data-testid=headline-percent]").getElement();
    await apply({
      slug: "pdk-2-sentry",
      log: "t4-agent-skills #31 merged.",
      ops: [{ op: "task", id: "t4-agent-skills", status: { kind: "done" } }],
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

    await expect($(`main [data-row="task:t4-agent-skills"] .text-sage`)).toHaveText("●");
    await expect($("html")).toHaveAttribute("data-theme", flipped);
    await expect($("main")).toHaveText(expect.stringContaining("10 of 27 tasks done"));
  });

  it("keeps focus on the cursor row when an MCP apply moves it to the end of its phase", async () => {
    await browser.keys(["Meta", "k"]);
    await expect($(`[role=dialog] [data-slot="command-input"]`)).toBeFocused();
    await browser.keys("t4-coa".split(""));
    await browser.keys("Enter");
    await expect(cursorRow()).toHaveAttribute("data-row", "task:t4-coa");
    await browser.keys("Escape");
    await expect($("[aria-label=Reader]")).not.toBeExisting();
    await browser.waitUntil(async () => (await focusedRow()) === "task:t4-coa");

    await apply({
      slug: "pdk-2-sentry",
      log: "t4-coa waits for the rest of its phase now.",
      ops: [{ op: "task", id: "t4-coa", after: "t4-midstream-insights" }],
    });
    await browser.waitUntil(
      async () =>
        (await $$(`main [data-kind="task"]`).map((row) => row.getAttribute("data-row")))
          .join(" ")
          .includes("task:t4-midstream-insights task:t4-coa"),
      { timeout: 1000, timeoutMsg: "t4-coa did not move below t4-midstream-insights" },
    );
    await browser.waitUntil(async () => (await focusedRow()) === "task:t4-coa", {
      timeout: 1000,
      timeoutMsg: "focus left t4-coa when it moved",
    });
    await browser.keys("k");
    await expect(cursorRow()).toHaveAttribute("data-row", "task:t4-midstream-insights");
  });

  it("y writes the cursor row's path to the clipboard, which the app cannot read back", async () => {
    const path = join(
      await root(),
      "pdk-2-sentry",
      "03a-framework-apps",
      "07-t4-midstream-insights.md",
    );
    await browser.keys("y");
    await browser.waitUntil(async () => (await toast()) === `copied ${path}`, {
      timeout: 2000,
      timeoutMsg: `no "copied ${path}" toast after y`,
    });
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
