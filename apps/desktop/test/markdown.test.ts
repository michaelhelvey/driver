import { describe, expect, it } from "bun:test";
import { htmlOf, renderInline, renderMarkdown, renderRaw } from "../src/markdown.ts";

const inert = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return {
    elements: [...host.querySelectorAll("*")].map((el) => el.tagName.toLowerCase()),
    handlers: [...host.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].map((a) => a.name).filter((name) => name.startsWith("on")),
    ),
    hrefs: [...host.querySelectorAll("[href]")].map((el) => el.getAttribute("href")),
    text: host.textContent,
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
  ])("renders $name inert", (c) => {
    const result = inert(htmlOf(renderMarkdown(c.source)));
    expect(result.elements).not.toContain("script");
    expect(result.elements).not.toContain("img");
    expect(result.handlers).toEqual([]);
    expect(result.hrefs).toEqual(c.hrefs);
    expect(result.text?.trim()).toBe(c.text);
  });

  it("escapes inline markdown the same way", () => {
    expect(inert(htmlOf(renderInline("<b onclick=x>hi</b> [a](javascript:x)"))).elements).toEqual([
      "span",
    ]);
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
