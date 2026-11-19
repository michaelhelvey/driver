import { afterEach, expect, it } from "bun:test";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { App } from "../src/app.tsx";
import { memorySource } from "../src/source/memory.ts";
import { fixtureTree, sleep, until, withStatus } from "./fixtures.ts";

const SKILLS = "pdk-2-sentry/01-framework/02-t4-agent-skills.md";
const AUTH = "pdk-2-sentry/02-canaries/02-t4-authorization-platform.md";
const LIST = `main [aria-label="Project"]`;

const percent = () =>
  document.querySelector("[data-testid=headline-percent]")?.firstChild?.textContent;

const title = () => document.querySelector("h1")?.textContent;

const cursorRow = () => document.querySelector(`${LIST} [data-cursor]`)?.textContent;

const readerPath = () => document.querySelector("[data-testid=reader-path]")?.textContent;

const raw = () => document.querySelector("[data-testid=reader-raw]")?.textContent;

const press = (
  key: string,
  target: Element | null = document.activeElement,
  init: KeyboardEventInit = {},
) =>
  (target ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );

const typeInto = (selector: string, text: string) => {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (input === null) throw new Error(`no ${selector}`);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const mode = () => document.querySelector("[data-testid=mode]")?.textContent;

const shownPhases = () =>
  [...document.querySelectorAll<HTMLElement>(`${LIST} [data-kind="phase"]`)]
    .map((row) => row.dataset.row)
    .join(" ");

const recordingClipboard = () => {
  const copied: string[] = [];
  return { copied, clipboard: { writeText: async (text: string) => void copied.push(text) } };
};

const mount = async () => {
  const tree = await fixtureTree();
  const source = memorySource("fixtures", tree);
  const { copied, clipboard } = recordingClipboard();
  const root = document.body.appendChild(document.createElement("div"));
  return {
    tree,
    source,
    copied,
    show: () => render(() => <App source={source} clipboard={clipboard} />, root),
  };
};

const focusList = () => document.querySelector<HTMLElement>(`${LIST} [tabindex='0']`)?.focus();

const moveCursor = async () => {
  focusList();
  expect(cursorRow()).toContain("t4-authorization-platform");
  ["j", "j", "k"].forEach((key) => press(key));
  await until(() => cursorRow()?.includes("t4-user-info"), true);
  expect(document.activeElement?.textContent).toContain("t4-user-info");
  press("k");
  await until(() => cursorRow()?.includes("t4-authorization-platform"), true);
};

const readAuthPlatform = async (file: string) => {
  press("Enter");
  await until(readerPath, "fixtures/pdk-2-sentry/02-canaries/02-t4-authorization-platform.md");
  expect(document.querySelector("[aria-label=Reader] h2")?.textContent).toBe(
    "t4-authorization-platform",
  );
  press("r");
  await until(raw, file.replace(/\n$/, ""));
  press("Enter");
  await until(readerPath, undefined);
};

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

it("loads the fixtures, follows a file change, moves the cursor and opens the reader, with no diagnostics", async () => {
  const { tree, source, show } = await mount();

  const { artifact } = await captureArtifact(
    async () => {
      dispose = show();
      await until(title, "driver");

      press("2", document.body);
      await until(title, "pdk-2-sentry");
      await until(percent, "33");
      expect(document.body.textContent).toContain("9 of 27 tasks done · 1 skipped");

      source.write(SKILLS, withStatus(tree.get(SKILLS) ?? "", "done"));
      await until(percent, "37");
      expect(document.body.textContent).toContain("10 of 27 tasks done · 1 skipped");

      await moveCursor();
      await readAuthPlatform(tree.get(AUTH) ?? "");

      press("J", document.body);
      await until(title, "billing-ledger-v2");
      press("K", document.body);
      await until(title, "pdk-2-sentry");
    },
    { scenario: "load, follow a change, move the cursor, open the reader" },
  );

  expectNoDiagnostics(artifact);
});

it("lists pdk-2-sentry's rows in page order, with the finished phase folded", async () => {
  const { show } = await mount();
  dispose = show();
  await until(title, "driver");
  press("2", document.body);
  await until(title, "pdk-2-sentry");

  const rows = [...document.querySelectorAll<HTMLElement>(`${LIST} [data-kind]`)];

  expect(rows.slice(0, 5).map((row) => row.dataset.kind)).toEqual([
    "project",
    "attention",
    "attention",
    "attention",
    "log",
  ]);
  expect(phasesOf(rows)).toEqual([
    ["00", []],
    ["01", ["01.1", "01.2", "01.3"]],
    ["02", ["02.1", "02.2"]],
    ["03a", ["03a.1", "03a.2", "03a.3", "03a.4", "03a.5", "03a.6", "03a.7"]],
    ["03b", ["03b.1", "03b.2", "03b.3"]],
    ["03c", ["03c.1", "03c.2", "03c.3"]],
    ["04", ["04.1"]],
  ]);
  expect(rows.map((row) => row.getAttribute("role"))).toEqual(rows.map(() => "option"));
  const phase00 = rows.find((row) => row.dataset.kind === "phase");
  expect(phase00?.textContent).toContain("pdk 2.0 — extension, preload, facade✓ 8/8");

  focusList();
  ["j", "j", "j", "j"].forEach((key) => press(key));
  await until(() => cursorRow()?.includes("pdk 2.0"), true);
  press(" ");
  await until(() => phasesOf(rowsNow())[0]?.[1].length, 9);
  press(" ");
  await until(() => phasesOf(rowsNow())[0]?.[1].length, 0);
});

const COA = "pdk-2-sentry/03a-framework-apps/01-t4-coa.md";

const focusedKey = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement.dataset.row : undefined;

const cursorKey = () => document.querySelector<HTMLElement>(`${LIST} [data-cursor]`)?.dataset.row;

it.each([
  [
    "moves it to the end of its phase",
    (text: string): [string, string][] => [[COA.replace("/01-", "/08-"), text]],
  ],
  [
    "moves it to another phase",
    (text: string): [string, string][] => [
      [COA.replace("03a-framework-apps/01-", "04-cleanup/02-"), text],
    ],
  ],
  [
    "marks it needs-you, so it also shows above",
    (text: string): [string, string][] => [
      [COA, text.replace(/^status: .*$/m, "status: needs-you\nask: ship it?")],
    ],
  ],
])(
  "keeps focus and the cursor on the row under the cursor when a live change %s",
  async (_, change) => {
    const { tree, source, show } = await mount();
    dispose = show();
    await until(title, "driver");
    press("2", document.body);
    await until(title, "pdk-2-sentry");
    focusList();
    const coa = document.querySelector<HTMLElement>(`${LIST} [data-row="task:t4-coa"]`);
    coa?.click();
    coa?.focus();
    await until(focusedKey, "task:t4-coa");

    source.remove(COA);
    change(tree.get(COA) ?? "").forEach(([path, text]) => source.write(path, text));

    await until(() => document.body.textContent.includes("t4-coa"), true);
    await sleep(300);
    expect([cursorKey(), focusedKey()]).toEqual(["task:t4-coa", "task:t4-coa"]);
  },
);

const PALETTE_INPUT = `[role=dialog] [data-slot="command-input"]`;

it.each<[string, (copied: string[]) => Promise<void>]>([
  [
    "/ filters, keeps the filter on ↵, and esc clears it",
    async () => {
      press("/");
      await until(mode, "FILTER");
      typeInto("[data-testid=filter]", "preload");
      await until(shownPhases, "phase:pdk-2.0");
      press("Enter");
      await until(mode, "NORMAL");
      await until(focusedKey, cursorKey());
      press("Escape");
      await until(() => shownPhases().split(" ").length, 7);
    },
  ],
  [
    "tab focuses the reader, j scrolls it, h goes back",
    async () => {
      press("Enter");
      await until(readerPath, `fixtures/${"pdk-2-sentry/01-framework/02-t4-agent-skills.md"}`);
      press("Tab");
      await until(mode, "READER");
      press("j");
      expect(cursorKey()).toBe("attention:t4-agent-skills");
      press("h");
      await until(mode, "NORMAL");
      await until(focusedKey, "attention:t4-agent-skills");
    },
  ],
  [
    "⌘K jumps to a task in another project",
    async () => {
      press("J");
      await until(title, "billing-ledger-v2");
      press("k", document.activeElement, { metaKey: true });
      await until(() => document.activeElement?.matches(PALETTE_INPUT), true);
      typeInto(PALETTE_INPUT, "t4-coa");
      press("Enter");
      await until(title, "pdk-2-sentry");
      await until(cursorKey, "task:t4-coa");
      await until(readerPath, `fixtures/${COA}`);
    },
  ],
  [
    "y copies the cursor row's path",
    async (copied) => {
      press("y");
      await until(() => copied.at(-1), `fixtures/${SKILLS}`);
      await until(() => document.body.textContent.includes(`copied fixtures/${SKILLS}`), true);
    },
  ],
])("%s, with no diagnostics", async (scenario, run) => {
  const { show, copied } = await mount();
  dispose = show();
  await until(title, "driver");
  press("2");
  await until(title, "pdk-2-sentry");
  await until(focusedKey, "attention:t4-agent-skills");

  const { artifact } = await captureArtifact(async () => run(copied), { scenario });

  expectNoDiagnostics(artifact);
});

it("says where it looks, and when to restart, when the root has no projects", async () => {
  const root = document.body.appendChild(document.createElement("div"));
  dispose = render(
    () => (
      <App
        source={memorySource("/Users/me/.driver", new Map())}
        clipboard={recordingClipboard().clipboard}
      />
    ),
    root,
  );
  await until(() => document.querySelector("[data-testid=empty]") !== null, true);
  const text = document.querySelector("[data-testid=empty]")?.textContent;
  expect(text).toContain("No projects in /Users/me/.driver.");
  expect(text).toContain("restart driver after the first project is created");
});

const rowsNow = () => [...document.querySelectorAll<HTMLElement>(`${LIST} [data-kind]`)];

const labelOf = (row: Element | undefined) =>
  String(row?.querySelector("[data-label]")?.textContent);

function phasesOf(rows: HTMLElement[]): [string, string[]][] {
  const starts = rows.flatMap((row, i) => (row.dataset.kind === "phase" ? [i] : []));
  return starts.map((start, n) => {
    const block = rows.slice(start + 1, starts[n + 1] ?? rows.length);
    const tasks = block.filter((row) => row.dataset.kind === "task");
    return [labelOf(rows[start]), tasks.map((row) => labelOf(row))];
  });
}
