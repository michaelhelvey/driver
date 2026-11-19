import { chromium } from "playwright";

const USAGE =
  "bun scripts/screenshot.ts <url> <out.png> [keys, comma separated, e.g. 2,t] [WIDTHxHEIGHT, default 1280x820]";

const [url, out, keys = "", size = "1280x820"] = Bun.argv.slice(2);
if (url === undefined || out === undefined) throw new Error(USAGE);
const dimensions = /^(\d+)x(\d+)$/.exec(size);
if (dimensions === null) throw new Error(USAGE);
const viewport = { width: Number(dimensions[1]), height: Number(dimensions[2]) };

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport });
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(url);
  await page.getByText("tasks done").waitFor();
  await keys
    .split(",")
    .filter(Boolean)
    .reduce((pressed, key) => pressed.then(() => page.keyboard.press(key)), Promise.resolve());
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ out, problems }, null, 2));
} finally {
  await browser.close();
}
