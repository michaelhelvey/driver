import { describe, expect, it } from "bun:test";
import { htmlOf, renderInline, renderMarkdown, renderRaw } from "../src/markdown.ts";

const TAGS = new Set(
  "p span a code pre h2 h3 h4 ul ol li strong em del blockquote table thead tbody tr th td br hr".split(
    " ",
  ),
);
const ATTRIBUTES = new Set(["class", "href", "target", "rel", "start", "align"]);

const inert = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  const elements = [...host.querySelectorAll("*")];
  return {
    unknownTags: elements.map((el) => el.tagName.toLowerCase()).filter((tag) => !TAGS.has(tag)),
    unknownAttributes: elements.flatMap((el) =>
      [...el.attributes].map((a) => a.name).filter((name) => !ATTRIBUTES.has(name)),
    ),
    hrefs: [...host.querySelectorAll("[href]")].map((el) => el.getAttribute("href")),
    text: host.textContent?.replace(/\s+/g, " ").trim(),
  };
};

describe("renderMarkdown escapes agent-written text", () => {
  it.each<{ name: string; source: string; text: string; hrefs: string[] }>([
    {
      name: "a script block",
      source: "<script>alert(1)</script>",
      text: "<script>alert(1)</script>",
      hrefs: [],
    },
    {
      name: "an inline script",
      source: "hi <script>alert(1)</script> there",
      text: "hi <script>alert(1)</script> there",
      hrefs: [],
    },
    {
      name: "an img with onerror",
      source: `<img src=x onerror="alert(1)">`,
      text: `<img src=x onerror="alert(1)">`,
      hrefs: [],
    },
    {
      name: "an inline img with onerror",
      source: `see <img src=x onerror=alert(1)>`,
      text: `see <img src=x onerror=alert(1)>`,
      hrefs: [],
    },
    { name: "a javascript: link", source: "[go](javascript:alert(1))", text: "go", hrefs: [] },
    {
      name: "an encoded javascript: link",
      source: "[go](jav&#x61;script:alert(1))",
      text: "go",
      hrefs: [],
    },
    { name: "a data: link", source: "[go](data:text/html,<b>x</b>)", text: "go", hrefs: [] },
    {
      name: "a markdown image",
      source: `![<b>alt</b>](x.png "t")`,
      text: "<b>alt</b>",
      hrefs: [],
    },
    {
      name: "html in a code span",
      source: "`<img onerror=alert(1)>`",
      text: "<img onerror=alert(1)>",
      hrefs: [],
    },
    {
      name: "html in a fenced block",
      source: "~~~sh\n<script>x</script>\n~~~",
      text: "sh$ <script>x</script>",
      hrefs: [],
    },
    {
      name: "a quote in a link",
      source: `[go](https://a.example/"onmouseover="x)`,
      text: "go",
      hrefs: [`https://a.example/"onmouseover="x`],
    },
    {
      name: "an attribute in a code block's language",
      source: '~~~js" onmouseover="x\n1\n~~~',
      text: 'js" onmouseover="x1',
      hrefs: [],
    },
    {
      name: "markup in a code block's language",
      source: "```<img src=x onerror=alert(1)>\nx\n```",
      text: "<img src=x onerror=alert(1)>x",
      hrefs: [],
    },
    {
      name: "html in a heading",
      source: "## <img src=x onerror=1> {#id onclick=x}",
      text: "## <img src=x onerror=1> {#id onclick=x}",
      hrefs: [],
    },
    {
      name: "a link title that breaks out of its quotes",
      source: `[a](https://x.example "t\\" onmouseover=x")`,
      text: "a",
      hrefs: ["https://x.example"],
    },
    {
      name: "html as a link's text",
      source: "[<img src=x onerror=1>](https://x.example)",
      text: "<img src=x onerror=1>",
      hrefs: ["https://x.example"],
    },
    {
      name: "html and a javascript: link in a table",
      source: "| a | b |\n|---|---|\n| <img src=x onerror=1> | <b>x</b> [y](javascript:1) |",
      text: "a b <img src=x onerror=1> <b>x</b> y",
      hrefs: [],
    },
    {
      name: "a javascript: autolink",
      source: "<javascript:alert(1)>",
      text: "javascript:alert(1)",
      hrefs: [],
    },
    {
      name: "a quote in an autolink",
      source: `<https://x.example/"onmouseover="x>`,
      text: `https://x.example/"onmouseover="x`,
      hrefs: [`https://x.example/"onmouseover="x`],
    },
    {
      name: "a bare www link followed by html",
      source: `www.x.example/"><img src=x>`,
      text: `www.x.example/"><img src=x>`,
      hrefs: [`http://www.x.example/">`],
    },
    {
      name: "entity-encoded html",
      source: "&#x3C;img src=x onerror=1&#x3E; &lt;svg onload=1&gt;",
      text: "<img src=x onerror=1> &lt;svg onload=1&gt;",
      hrefs: [],
    },
    {
      name: "backslash-escaped html",
      source: "\\<img src=x onerror=1>",
      text: "<img src=x onerror=1>",
      hrefs: [],
    },
    {
      name: "an html comment before html",
      source: "<!-- c --><svg onload=alert(1)>",
      text: "<!-- c --><svg onload=alert(1)>",
      hrefs: [],
    },
    {
      name: "an html block around markdown",
      source: "<div onclick=x>\n\n**md**\n\n</div>",
      text: "<div onclick=x>md </div>",
      hrefs: [],
    },
  ])("renders $name inert", (c) => {
    const result = inert(htmlOf(renderMarkdown(c.source)));
    expect(result.unknownTags).toEqual([]);
    expect(result.unknownAttributes).toEqual([]);
    expect(result.hrefs).toEqual(c.hrefs);
    expect(result.text).toBe(c.text);
  });

  it.each([
    { source: "<b onclick=x>hi</b> [a](javascript:x)", text: "<b onclick=x>hi</b> a" },
    { source: "`<i>` &#60;svg onload=1&#62; <x:y>", text: "<i> <svg onload=1> <x:y>" },
  ])("escapes inline markdown the same way: $source", (c) => {
    const result = inert(htmlOf(renderInline(c.source)));
    expect(result.unknownTags).toEqual([]);
    expect(result.unknownAttributes).toEqual([]);
    expect(result.hrefs).toEqual([]);
    expect(result.text).toBe(c.text);
  });

  it("escapes raw files", () => {
    const text = `---\ntitle: <img src=x onerror=1>\n<b>: x\n---\n\n## <svg onload=1>\n`;
    const result = inert(htmlOf(renderRaw(text)));
    expect(result.unknownTags).toEqual([]);
    expect(result.unknownAttributes).toEqual([]);
  });
});

describe("renderMarkdown draws the mockup's markdown", () => {
  it.each([
    {
      name: "a faint hash before headings",
      source: "## options",
      html: `<h3><span class="hash">##</span> options</h3>`,
    },
    {
      name: "done and open step boxes",
      source: "- [x] merged\n- [ ] deployed",
      html: `<ul>\n<li class="task on"><span class="box">[x]</span><span class="txt">merged</span></li>\n<li class="task"><span class="box">[ ]</span><span class="txt">deployed</span></li>\n</ul>`,
    },
    {
      name: "prompts, comments and results in sh blocks",
      source: "~~~sh\nbun x \\\n  --y\n# a comment\n# → 3 skipped\n~~~",
      html: `<pre><span class="lang">sh</span><code><span class="ps">$ </span>bun x \\\n  --y\n<span class="c"># a comment</span>\n<span class="o"># → 3 skipped</span></code></pre>`,
    },
    {
      name: "no prompt outside sh blocks",
      source: "~~~\n~/.driver/\n  log.md      # append-only\n~~~",
      html: `<pre><code>~/.driver/\n  log.md      # append-only</code></pre>`,
    },
    {
      name: "PR refs in the accent color",
      source: "review #412 (and #31)",
      html: `<p>review <span class="ref">#412</span> (and <span class="ref">#31</span>)</p>`,
    },
    {
      name: "safe links that open outside",
      source: "[docs](https://example.com)",
      html: `<p><a href="https://example.com" target="_blank" rel="noreferrer">docs</a></p>`,
    },
  ])("renders $name", (c) => {
    expect(htmlOf(renderMarkdown(c.source)).trim()).toBe(c.html);
  });
});

describe("renderRaw", () => {
  it("shows the file as it is, escaped, with keys and headings marked", () => {
    const text = `---\ntitle: a <b>\npr: "#2"\n---\n\n## x\n\n~~~\n## not a heading\n~~~\n`;
    const host = document.createElement("pre");
    host.innerHTML = htmlOf(renderRaw(text));
    expect(`${host.textContent}\n`).toBe(text);
    expect([...host.querySelectorAll(".k")].map((el) => el.textContent)).toEqual(["title", "pr"]);
    expect([...host.querySelectorAll(".h")].map((el) => el.textContent)).toEqual(["## x"]);
    expect(host.querySelector("b")).toBeNull();
  });
});
