import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type Page } from "playwright";
import { createServer } from "vite-plus";

const USAGE = `bun scripts/parity.ts [--out dir] [--url http://localhost:1431/] [--only text]

Screenshots mockups/driver.html and the browser build on the fixtures in the same state, and
writes <out>/<project>-<theme>-<state>.png: mockup | app | diff, plus report.json with the share
of pixels that differ in each pair. Without --url it starts its own dev server.`;

const DESKTOP = join(import.meta.dir, "..");
const MOCKUP = `file://${join(DESKTOP, "..", "..", "mockups", "driver.html")}`;
const NOW = new Date("2026-11-19T07:40:00Z");
const VIEWPORT = { width: 1280, height: 820 };
const SCALE = 2;
const THRESHOLD = 40;

type Shot = {
  name: string;
  project: string;
  theme: "paper" | "cocoa";
  keys: string[];
  scroll?: number;
};

const SCROLLERS = { mockup: "#scroll", app: "main [data-slot=scroll-area-viewport]" };

const PROJECTS = [
  { project: "pdk-2-sentry", select: "2", reader: ["j", "Enter"] },
  { project: "driver", select: "1", reader: ["Enter"] },
];

const SHOTS: Shot[] = PROJECTS.flatMap(({ project, select, reader }) =>
  (["paper", "cocoa"] as const).flatMap((theme) => {
    const base = theme === "cocoa" ? [select, "t"] : [select];
    return [
      { name: `${project}-${theme}-page`, project, theme, keys: base },
      { name: `${project}-${theme}-phases`, project, theme, keys: base, scroll: 640 },
      { name: `${project}-${theme}-reader`, project, theme, keys: [...base, ...reader] },
      { name: `${project}-${theme}-raw`, project, theme, keys: [...base, ...reader, "r"] },
    ];
  }),
);

const { values } = parseArgs({
  options: {
    out: { type: "string", default: join(DESKTOP, "parity") },
    url: { type: "string" },
    only: { type: "string", default: "" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const PORT = 1432;

const startServer = async (): Promise<{ url: string; stop: () => Promise<void> }> => {
  const server = await createServer({
    root: DESKTOP,
    configFile: join(DESKTOP, "vite.config.ts"),
    server: { port: PORT, strictPort: true },
    logLevel: "warn",
  });
  await server.listen();
  return { url: `http://localhost:${PORT}/`, stop: () => server.close() };
};

const press = async (page: Page, keys: readonly string[]) => {
  for (const key of keys) {
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press(key);
  }
};

const ready = async (page: Page, url: string) => {
  await page.clock.setFixedTime(NOW);
  await page.goto(url);
  await page.getByText("tasks done").first().waitFor();
};

const scroll = async (page: Page, selector: string, by: number | undefined) => {
  if (by !== undefined) await page.locator(selector).evaluate((el, y) => el.scrollTo(0, y), by);
};

const shootMockup = async (page: Page, shot: Shot) => {
  await ready(page, MOCKUP);
  await press(page, shot.keys);
  await scroll(page, SCROLLERS.mockup, shot.scroll);
};

const shootApp = async (page: Page, shot: Shot, url: string) => {
  await ready(page, url);
  const [select, ...rest] = shot.keys;
  await press(page, [select ?? ""]);
  await page.getByRole("heading", { level: 1, name: shot.project }).waitFor();
  const [theme, list] = rest[0] === "t" ? [["t"], rest.slice(1)] : [[], rest];
  await press(page, theme);
  await page.locator(`main [aria-label="Project"] [data-cursor]`).focus();
  await press(page, list);
  await scroll(page, SCROLLERS.app, shot.scroll);
};

const capture = async (
  browser: Browser,
  shoot: (page: Page) => Promise<void>,
): Promise<{ png: Buffer; problems: string[] }> => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (m) => void (m.type() === "error" && problems.push(m.text())));
  page.on("pageerror", (error) => problems.push(error.message));
  try {
    await shoot(page);
    await page.waitForTimeout(1000);
    await page.mouse.move(0, VIEWPORT.height - 1);
    return { png: await page.screenshot(), problems };
  } finally {
    await context.close();
  }
};

type Compared = { percent: number; png: Buffer };

/* oxlint-disable unicorn/consistent-function-scoping -- runs in the page, so its helpers must live inside it */
const diffInPage = async (input: { mock: string; app: string; threshold: number }) => {
  const load = async (src: string) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  };
  const context = (canvas: OffscreenCanvas) => {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d context");
    return ctx;
  };
  const pixels = (image: HTMLImageElement) => {
    const ctx = context(new OffscreenCanvas(image.width, image.height));
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height).data;
  };
  const channel = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) =>
    Math.abs(Number(a[i]) - Number(b[i]));
  const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) =>
    Math.max(channel(a, b, i), channel(a, b, i + 1), channel(a, b, i + 2)) > input.threshold;
  const paint = (a: Uint8ClampedArray, i: number, hit: boolean): number[] => {
    const gray = (Number(a[i]) + Number(a[i + 1]) + Number(a[i + 2])) / 12 + 170;
    return hit ? [230, 30, 60, 255] : [gray, gray, gray, 255];
  };
  const diffOf = (a: Uint8ClampedArray, b: Uint8ClampedArray, out: ImageData) => {
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const hit = differs(a, b, i);
      changed += Number(hit);
      out.data.set(paint(a, i, hit), i);
    }
    return changed;
  };
  const base64 = async (canvas: OffscreenCanvas) => {
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };

  const [a, b] = await Promise.all([load(input.mock), load(input.app)]);
  const diff = new ImageData(a.width, a.height);
  const changed = diffOf(pixels(a), pixels(b), diff);
  const out = new OffscreenCanvas(a.width * 3, a.height);
  const ctx = context(out);
  ctx.drawImage(a, 0, 0);
  ctx.drawImage(b, a.width, 0);
  ctx.putImageData(diff, a.width * 2, 0);
  return { percent: (changed / (a.width * a.height)) * 100, png: await base64(out) };
};
/* oxlint-enable unicorn/consistent-function-scoping */

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

const compare = async (browser: Browser, mock: Buffer, app: Buffer): Promise<Compared> => {
  const page = await browser.newPage();
  try {
    const input = { mock: dataUrl(mock), app: dataUrl(app), threshold: THRESHOLD };
    const result = await page.evaluate(diffInPage, input);
    return { percent: result.percent, png: Buffer.from(result.png, "base64") };
  } finally {
    await page.close();
  }
};

const server = values.url === undefined ? await startServer() : undefined;
const url = values.url ?? server?.url ?? "";
const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars"] });
await mkdir(join(values.out, "single"), { recursive: true });

try {
  const report: { name: string; percent: number; file: string; problems: string[] }[] = [];
  for (const shot of SHOTS.filter((s) => s.name.includes(values.only))) {
    // oxlint-disable-next-line no-await-in-loop
    const mock = await capture(browser, (page) => shootMockup(page, shot));
    // oxlint-disable-next-line no-await-in-loop
    const app = await capture(browser, (page) => shootApp(page, shot, url));
    // oxlint-disable-next-line no-await-in-loop
    const compared = await compare(browser, mock.png, app.png);
    const file = join(values.out, `${shot.name}.png`);
    // oxlint-disable-next-line no-await-in-loop
    await Promise.all([
      writeFile(file, compared.png),
      writeFile(join(values.out, "single", `${shot.name}.mockup.png`), mock.png),
      writeFile(join(values.out, "single", `${shot.name}.app.png`), app.png),
    ]);
    const percent = Math.round(compared.percent * 100) / 100;
    report.push({ name: shot.name, percent, file, problems: [...mock.problems, ...app.problems] });
    console.log(`${percent.toFixed(2).padStart(6)}%  ${file}`);
  }
  await writeFile(join(values.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const problems = report.flatMap((r) => r.problems.map((p) => `${r.name}: ${p}`));
  if (problems.length > 0) console.error(`console errors:\n${problems.join("\n")}`);
} finally {
  await browser.close();
  await server?.stop();
}
