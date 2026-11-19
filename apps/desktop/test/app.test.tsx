import { afterEach, expect, it } from "bun:test";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { App } from "../src/app.tsx";
import { memorySource } from "../src/source/memory.ts";
import { fixtureTree, until, withStatus } from "./fixtures.ts";

const SKILLS = "pdk-2-sentry/01-framework/02-t4-agent-skills.md";
const LIST = `main [aria-label="Project"]`;

const percent = () =>
  document.querySelector("[data-testid=headline-percent]")?.firstChild?.textContent;

const title = () => document.querySelector("h1")?.textContent;

const cursorRow = () => document.querySelector(`${LIST} [data-cursor]`)?.textContent;

const press = (key: string, target: Element | null = document.activeElement) =>
  (target ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

const mount = async () => {
  const tree = await fixtureTree();
  const source = memorySource("fixtures", tree);
  const root = document.body.appendChild(document.createElement("div"));
  return { tree, source, show: () => render(() => <App source={source} />, root) };
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

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

it("loads the fixtures, follows a file change and moves the list cursor, with no diagnostics", async () => {
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

      press("J", document.body);
      await until(title, "billing-ledger-v2");
      press("K", document.body);
      await until(title, "pdk-2-sentry");
    },
    { scenario: "load, follow a change, move the cursor" },
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

it("says where it looks, and when to restart, when the root has no projects", async () => {
  const root = document.body.appendChild(document.createElement("div"));
  dispose = render(() => <App source={memorySource("/Users/me/.driver", new Map())} />, root);
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
