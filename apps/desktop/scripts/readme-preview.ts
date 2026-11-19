import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Marked, type Tokens } from "marked";
import { chromium } from "playwright";

const USAGE = "bun scripts/readme-preview.ts [out-dir, default /tmp/driver-readme]";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CSS = Bun.resolveSync("github-markdown-css/github-markdown.css", import.meta.dir);
const [outDir = "/tmp/driver-readme"] = Bun.argv.slice(2);
if (Bun.argv.length > 3) throw new Error(USAGE);

const slugger = () => {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .replace(/[`*_~]|<[^>]+>/g, (match) => (match === "_" ? "_" : ""))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
};

const render = (markdown: string) => {
  const slug = slugger();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(token: Tokens.Heading) {
        return `<h${token.depth} id="${slug(token.text)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      blockquote(token: Tokens.Blockquote) {
        const body = this.parser.parse(token.tokens);
        const alert = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/.exec(body);
        if (alert === null) return `<blockquote>\n${body}</blockquote>\n`;
        const kind = alert[1]!.toLowerCase();
        return `<div class="markdown-alert markdown-alert-${kind}"><p class="markdown-alert-title">${kind[0]!.toUpperCase()}${kind.slice(1)}</p><p>${body.slice(alert[0].length)}</div>\n`;
      },
    },
  });
  return marked.parse(markdown, { async: false });
};

const anchors = (markdown: string) => {
  const slug = slugger();
  return new Set(
    [...markdown.replace(/^```[\s\S]*?^```/gm, "").matchAll(/^#{1,6} (.+)$/gm)].map((m) =>
      slug(m[1]!),
    ),
  );
};

const brokenLinks = async (html: string) => {
  const targets = [...html.matchAll(/(?:href|src|srcset)="([^"]+)"/g)]
    .map((match) => match[1]!)
    .filter((target) => !/^(https?:|mailto:)/.test(target));
  const checks = await Promise.all(
    targets.map(async (target) => {
      const url = new URL(target, pathToFileURL(join(ROOT, "README.md")));
      const file = fileURLToPath(url);
      if (!existsSync(file)) return `${target}: no such file`;
      const hash = decodeURIComponent(url.hash.slice(1));
      const found = hash === "" || anchors(await Bun.file(file).text()).has(hash);
      return found ? null : `${target}: no such heading`;
    }),
  );
  return checks.filter((problem) => problem !== null);
};

const html = render(await Bun.file(join(ROOT, "README.md")).text());
const broken = await brokenLinks(html);

await mkdir(outDir, { recursive: true });
const page = join(outDir, "README.html");
await Bun.write(
  page,
  `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(ROOT).href}/">
<link rel="stylesheet" href="${pathToFileURL(CSS).href}">
<style>body{margin:0}.markdown-body{box-sizing:border-box;min-height:100vh;max-width:1000px;margin:0 auto;padding:45px}</style>
</head><body><article class="markdown-body">${html}</article></body></html>`,
);

const browser = await chromium.launch({ channel: "chrome" });
try {
  const shots = await Promise.all(
    (["light", "dark"] as const).map(async (colorScheme) => {
      const tab = await browser.newPage({ viewport: { width: 1000, height: 900 }, colorScheme });
      await tab.goto(pathToFileURL(page).href, { waitUntil: "networkidle" });
      const out = join(outDir, `${colorScheme}.png`);
      await tab.screenshot({ path: out, fullPage: true });
      return out;
    }),
  );
  console.log(JSON.stringify({ html: page, shots, broken }, null, 2));
} finally {
  await browser.close();
}
if (broken.length > 0) process.exit(1);
