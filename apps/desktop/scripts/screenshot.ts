import { chromium } from "playwright";

const USAGE = "bun scripts/screenshot.ts <url> <out.png> [keys, comma separated, e.g. 2,t]";

const [url, out, keys = ""] = Bun.argv.slice(2);
if (url === undefined || out === undefined) throw new Error(USAGE);

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
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
