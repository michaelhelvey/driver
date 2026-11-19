import { Marked, type RendererObject, type Tokens } from "marked";

const SAFE: unique symbol = Symbol("safe-html");

/** HTML in which every piece of agent-written text is escaped. Only this module makes it. */
export type SafeHtml = { readonly [SAFE]: string };

const safe = (html: string): SafeHtml => ({ [SAFE]: html });

/**
 * The HTML string of a {@link SafeHtml}.
 *
 * @example
 * htmlOf(renderInline("**hi**")); // "<strong>hi</strong>"
 */
export function htmlOf(html: SafeHtml): string {
  return html[SAFE];
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes text for HTML: element content and quoted attribute values.
 *
 * @example
 * escapeHtml(`<img src=x onerror="alert(1)">`); // "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const REF = /(^|[\s(])#(\d{2,5})\b/g;
const SAFE_HREF = /^(https?:|mailto:)/i;
const COMMENT = /^\s*(#|--|\/\/)/;
const SH_COMMENT = /^\s*#/;
const SHELLS = new Set(["sh", "bash", "zsh", "shell"]);
const PROMPT = `<span class="ps">$ </span>`;

const refs = (html: string) => html.replace(REF, `$1<span class="ref">#$2</span>`);

const comment = (line: string) =>
  `<span class="${line.includes("→") ? "o" : "c"}">${escapeHtml(line)}</span>`;

const continues = (line: string | undefined) => line?.trimEnd().endsWith("\\") === true;

const isPrompt = (lines: readonly string[], i: number) =>
  (lines[i] ?? "").trim() !== "" && !continues(lines[i - 1]);

const codeLines = (text: string, shell: boolean): string => {
  const lines = text.split("\n");
  const isComment = shell ? SH_COMMENT : COMMENT;
  const prompt = (i: number) => (shell && isPrompt(lines, i) ? PROMPT : "");
  return lines
    .map((line, i) => (isComment.test(line) ? comment(line) : prompt(i) + escapeHtml(line)))
    .join("\n");
};

const langLabel = (lang: string) =>
  lang === "" ? "" : `<span class="lang">${escapeHtml(lang)}</span>`;

const renderer: RendererObject = {
  html: ({ text }) => escapeHtml(text),
  code: ({ text, lang = "" }) =>
    `<pre>${langLabel(lang)}<code>${codeLines(text, SHELLS.has(lang))}</code></pre>\n`,
  codespan: ({ text }) => `<code>${escapeHtml(text)}</code>`,
  heading({ tokens, depth }) {
    const level = Math.min(depth + 1, 4);
    const hashes = `<span class="hash">${"#".repeat(depth)}</span>`;
    return `<h${level}>${hashes} ${this.parser.parseInline(tokens)}</h${level}>\n`;
  },
  checkbox: () => "",
  listitem(item: Tokens.ListItem) {
    const body = this.parser.parse(item.tokens);
    return item.task
      ? `<li class="task${item.checked === true ? " on" : ""}"><span class="box">[${item.checked === true ? "x" : " "}]</span><span class="txt">${body}</span></li>\n`
      : `<li>${body}</li>\n`;
  },
  link({ href, tokens }) {
    const text = this.parser.parseInline(tokens);
    return SAFE_HREF.test(href)
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${text}</a>`
      : `<span class="link">${text}</span>`;
  },
  image: ({ text }) => `<span class="image">${escapeHtml(text)}</span>`,
  text(token) {
    return "tokens" in token && token.tokens !== undefined
      ? this.parser.parseInline(token.tokens)
      : refs(escapeHtml(token.text));
  },
};

const marked = new Marked({ gfm: true, breaks: false, async: false, renderer });

/**
 * Renders agent-written markdown as HTML the way the mockup draws it: a faint `##` before each
 * heading, `[x]` / `[ ]` boxes on steps, a `$ ` prompt on `sh` lines, muted comment lines and
 * `# →` result lines in sage, `#412` refs in the accent color. Nothing in the source reaches the
 * page as markup: raw HTML is shown as text, images as their alt text, and only `http(s):` and
 * `mailto:` links get an `href`.
 *
 * @example
 * renderMarkdown("## steps\n\n- [x] merged"); // `<h3><span class="hash">##</span> steps</h3>…`
 * renderMarkdown("<script>alert(1)</script>"); // "&lt;script&gt;alert(1)&lt;/script&gt;"
 */
export function renderMarkdown(source: string): SafeHtml {
  return safe(marked.parse(source, { async: false }));
}

/**
 * Renders one line of markdown (an `ask`, a log entry, a phase note) without a paragraph, with
 * the same escaping as {@link renderMarkdown}.
 *
 * @example
 * renderInline("review `#412`"); // "review <code>#412</code>"
 */
export function renderInline(source: string): SafeHtml {
  return safe(marked.parseInline(source, { async: false }));
}

const FRONTMATTER = /^(---\n[\s\S]*?\n---)(\n[\s\S]*)?$/;
const FENCE = /^(```|~~~)/;
const HEADING = /^#{1,4}\s/;
const FIELD = /^([\w-]+):(.*)$/;

const field = ([, key, value]: RegExpExecArray) =>
  `<span class="k">${escapeHtml(String(key))}</span><span class="d">:</span>${escapeHtml(String(value))}`;

const frontmatterLine = (line: string) => {
  if (line === "---") return `<span class="d">---</span>`;
  const match = FIELD.exec(line);
  return match === null ? escapeHtml(line) : field(match);
};

const lines = (text: string) => text.replace(/\n$/, "").split("\n");

const splitRaw = (text: string): { head: string[]; body: string[] } => {
  const match = FRONTMATTER.exec(text);
  return match === null
    ? { head: [], body: lines(text) }
    : { head: String(match[1]).split("\n"), body: lines(match[2] ?? "").slice(1) };
};

const bodyLines = (lines: readonly string[]): string[] => {
  let fences = 0;
  return lines.map((line) => {
    fences += FENCE.test(line) ? 1 : 0;
    const heading = fences % 2 === 0 && HEADING.test(line);
    return heading ? `<span class="h">${escapeHtml(line)}</span>` : escapeHtml(line);
  });
};

/**
 * Renders a file exactly as it is on disk, escaped, with its frontmatter keys and markdown
 * headings marked for color.
 *
 * @example
 * renderRaw("---\ntitle: a\n---\n\n## x\n");
 * // `<span class="d">---</span>\n<span class="k">title</span><span class="d">:</span> a\n…`
 */
export function renderRaw(text: string): SafeHtml {
  const { head, body } = splitRaw(text);
  return safe([...head.map(frontmatterLine), ...bodyLines(body)].join("\n"));
}
