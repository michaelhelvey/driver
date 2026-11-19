import { expect, test, type Page } from "@playwright/test";

const ROOT = "packages/core/fixtures";
const IMAGES = "pinion-2-plugins/02-canaries/02-plugin-images.md";
const SITEMAP = "pinion-2-plugins/03a-framework-apps/01-plugin-sitemap.md";

const list = (page: Page) => page.locator(`main [role=listbox]`);
const cursor = (page: Page) => list(page).locator("[data-cursor]");
const row = (page: Page, key: string) => list(page).locator(`[data-row="${key}"]`);
const mode = (page: Page) => page.getByTestId("mode");
const title = (page: Page) => page.locator("main h1");
const reader = (page: Page) => page.getByRole("region", { name: "Reader" });
const readerPath = (page: Page) => page.getByTestId("reader-path");
const phases = (page: Page) =>
  list(page)
    .locator(`[data-kind="phase"]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-row")));

const focusedRow = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-row]")?.dataset.row);

const keys = async (page: Page, ...presses: string[]) => {
  for (const key of presses) {
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press(key);
  }
};

const openPalette = async (page: Page) => {
  await keys(page, "Meta+k");
  await expect(page.getByRole("combobox", { name: /jump to a project/i })).toBeFocused();
};

const expectCursor = async (page: Page, key: string) => {
  await expect(cursor(page)).toHaveAttribute("data-row", key);
  await expect.poll(() => focusedRow(page)).toBe(key);
};

test("drives every key of the sheet with no mouse", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => void (message.type() === "error" && errors.push(message.text())));
  await page.goto("/");
  await expect(title(page)).toHaveText("driver");
  await expect(mode(page)).toHaveText("NORMAL");

  await test.step("1–9 jumps to a project, and the cursor row has focus", async () => {
    await keys(page, "2");
    await expect(title(page)).toHaveText("pinion-2-plugins");
    await expect(page.getByTestId("headline-percent")).toHaveText("33%");
    await expectCursor(page, "attention:pinion-docs");
  });

  await test.step("j / k / arrows move", async () => {
    await keys(page, "j");
    await expectCursor(page, "attention:plugin-images");
    await keys(page, "k", "ArrowDown");
    await expectCursor(page, "attention:plugin-images");
  });

  await test.step("↵ opens the reader on the cursor row's file", async () => {
    await keys(page, "Enter");
    await expect(readerPath(page)).toHaveText(`${ROOT}/${IMAGES}`);
    await expect(reader(page).locator("h2")).toHaveText("plugin-images");
    await expect(mode(page)).toHaveText("NORMAL");
  });

  await test.step("tab focuses the reader: j scrolls it, not the list", async () => {
    await keys(page, "Tab");
    await expect(mode(page)).toHaveText("READER");
    await expect(reader(page)).toHaveAttribute("data-focused", "");
    const viewport = reader(page).locator("[data-slot=scroll-area-viewport]");
    await keys(page, "j", "j");
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await keys(page, "g", "g");
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(cursor(page)).toHaveAttribute("data-row", "attention:plugin-images");
  });

  await test.step("r shows the raw file, then rendered", async () => {
    await keys(page, "r");
    await expect(page.getByTestId("reader-raw")).toContainText("status: needs-you");
    await keys(page, "r");
    await expect(page.getByTestId("reader-raw")).toHaveCount(0);
  });

  await test.step("h goes back to the list, l to the reader, esc back again", async () => {
    await keys(page, "h");
    await expect(mode(page)).toHaveText("NORMAL");
    await expectCursor(page, "attention:plugin-images");
    await keys(page, "l");
    await expect(mode(page)).toHaveText("READER");
    await keys(page, "Escape");
    await expect(mode(page)).toHaveText("NORMAL");
    await expect(reader(page)).toBeVisible();
    await keys(page, "Escape");
    await expect(reader(page)).toHaveCount(0);
    await expectCursor(page, "attention:plugin-images");
  });

  await test.step("G / g g go to the bottom and top, ^d / ^u by half a page", async () => {
    await keys(page, "G");
    await expectCursor(page, "task:compat-shim");
    await keys(page, "g", "g");
    await expectCursor(page, "project");
    await keys(page, "Control+d");
    await expectCursor(page, "task:pinion-docs");
    await keys(page, "Control+u");
    await expectCursor(page, "project");
  });

  await test.step("a goes to the first thing that needs you", async () => {
    await keys(page, "a");
    await expectCursor(page, "attention:pinion-docs");
  });

  await test.step("space folds and unfolds the cursor's phase", async () => {
    await keys(page, "G");
    await expectCursor(page, "task:compat-shim");
    await keys(page, " ");
    await expectCursor(page, "phase:cleanup");
    await expect(row(page, "task:compat-shim")).toBeHidden();
    await keys(page, " ");
    await expect(row(page, "task:compat-shim")).toBeVisible();
    await expect(reader(page)).toHaveCount(0);
  });

  await test.step("/ filters: phases without a match hide, folds are ignored, esc clears", async () => {
    await keys(page, "/");
    await expect(mode(page)).toHaveText("FILTER");
    await page.keyboard.type("preload");
    await expect.poll(() => phases(page)).toEqual(["phase:pinion-2.0"]);
    await expect(row(page, "task:preload")).toBeVisible();
    await expect(page.getByTestId("filter-count")).toHaveText("3 of 28");
    await keys(page, "j");
    await expect(page.getByTestId("filter")).toHaveValue("preloadj");
    await keys(page, "Backspace", "Enter");
    await expect(mode(page)).toHaveText("NORMAL");
    await expect(page.locator("footer")).toContainText("/preload");
    await keys(page, "G");
    await expectCursor(page, "task:manifest-hooks");
    await keys(page, "Escape");
    await expect(page.getByTestId("filter")).toHaveCount(0);
    await expect.poll(() => phases(page)).toHaveLength(7);
    await expect(row(page, "task:preload")).toBeHidden();
  });

  await test.step("p and L open project.md and log.md", async () => {
    await keys(page, "p");
    await expect(readerPath(page)).toHaveText(`${ROOT}/pinion-2-plugins/project.md`);
    await keys(page, "L");
    await expect(readerPath(page)).toHaveText(`${ROOT}/pinion-2-plugins/log.md`);
    await keys(page, "g", "p");
    await expect(readerPath(page)).toHaveText(`${ROOT}/pinion-2-plugins/project.md`);
    await keys(page, "Escape");
  });

  await test.step("J / K step through projects", async () => {
    await keys(page, "J");
    await expect(title(page)).toHaveText("billing-ledger-v2");
    await keys(page, "K");
    await expect(title(page)).toHaveText("pinion-2-plugins");
  });

  await test.step("b jumps to the blocker", async () => {
    await keys(page, "J");
    await expect(title(page)).toHaveText("billing-ledger-v2");
    await keys(page, "a", "j", "j");
    await expectCursor(page, "attention:read-flag");
    await keys(page, "b");
    await expectCursor(page, "task:reconcile-job");
    await keys(page, "b");
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText(
      "no blocker on this one",
    );
  });

  await test.step("g n goes to the next task that needs you, in any project", async () => {
    await keys(page, "a");
    await expectCursor(page, "attention:pr-backfill");
    await keys(page, "g", "n");
    await expect(title(page)).toHaveText("driver");
    await expectCursor(page, "task:keymap");
    await expect(readerPath(page)).toHaveText(`${ROOT}/driver/02-prototype/02-keymap.md`);
    await keys(page, "g", "n");
    await expect(title(page)).toHaveText("pinion-2-plugins");
    await expectCursor(page, "task:pinion-docs");
    await keys(page, "Escape");
  });

  await test.step("⌘K jumps across projects, to a project and to a task", async () => {
    await openPalette(page);
    await expect(mode(page)).toHaveText("PALETTE");
    await page.keyboard.type("onboarding");
    await keys(page, "Enter");
    await expect(title(page)).toHaveText("onboarding-docs");
    await expect(mode(page)).toHaveText("NORMAL");
    await openPalette(page);
    await page.keyboard.type("plugin-sitemap");
    await keys(page, "Enter");
    await expect(title(page)).toHaveText("pinion-2-plugins");
    await expectCursor(page, "task:plugin-sitemap");
    await expect(readerPath(page)).toHaveText(`${ROOT}/${SITEMAP}`);
    await openPalette(page);
    await page.keyboard.type("zz");
    await expect(page.getByText("nothing matches. it's not in a file anywhere.")).toBeVisible();
    await keys(page, "Escape");
    await expect(mode(page)).toHaveText("NORMAL");
    await expectCursor(page, "task:plugin-sitemap");
    await openPalette(page);
    await keys(page, "Meta+k");
    await expect(page.getByRole("dialog", { name: "palette" })).toHaveCount(0);
    await expect(mode(page)).toHaveText("NORMAL");
    await expectCursor(page, "task:plugin-sitemap");
  });

  await test.step("y copies the cursor row's path", async () => {
    await keys(page, "y");
    await expect
      .poll(() => page.evaluate(async () => navigator.clipboard.readText()))
      .toBe(`${ROOT}/${SITEMAP}`);
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText(
      `copied ${ROOT}/${SITEMAP}`,
    );
  });

  await test.step("c copies a reference to the cursor row's task", async () => {
    const reference = `re plugin-sitemap (plugin-sitemap): ${ROOT}/${SITEMAP}`;
    await keys(page, "c");
    await expect
      .poll(() => page.evaluate(async () => navigator.clipboard.readText()))
      .toBe(reference);
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText(
      `copied ${reference}`,
    );
  });

  await test.step("? shows the keys; list keys do nothing under it", async () => {
    await keys(page, "?");
    await expect(mode(page)).toHaveText("KEYS");
    const sheet = page.getByRole("dialog", { name: "keys" });
    await expect(sheet).toContainText("next that needs you, any project");
    await expect(sheet).not.toContainText("coordinator");
    await keys(page, "j", "t");
    await expect(cursor(page)).toHaveAttribute("data-row", "task:plugin-sitemap");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    await keys(page, "?");
    await expect(sheet).toHaveCount(0);
    await expectCursor(page, "task:plugin-sitemap");
  });

  await test.step("t switches the theme", async () => {
    await keys(page, "t");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "cocoa");
    await keys(page, "t");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  });

  await test.step("[ hides and shows the sidebar", async () => {
    const sidebar = page.getByRole("listbox", { name: "Projects" });
    await keys(page, "[");
    await expect(sidebar).toBeHidden();
    await keys(page, "[");
    await expect(sidebar).toBeVisible();
    await expectCursor(page, "task:plugin-sitemap");
  });

  expect(errors).toEqual([]);
});
