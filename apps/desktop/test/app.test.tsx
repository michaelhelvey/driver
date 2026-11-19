import { afterEach, expect, it } from "bun:test";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { App } from "../src/app.tsx";
import { memorySource } from "../src/source/memory.ts";
import { fixtureTree, until, withStatus } from "./fixtures.ts";

const SKILLS = "pdk-2-sentry/01-framework/02-t4-agent-skills.md";
const LIST = `[aria-label="Phases and tasks"]`;

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

      document.querySelector<HTMLElement>(`${LIST} [tabindex='0']`)?.focus();
      ["j", "j", "j", "k"].forEach((key) => press(key));
      await until(() => cursorRow()?.includes("extension crate (rust)"), true);
      expect(document.activeElement?.textContent).toContain("extension crate (rust)");

      press("J", document.body);
      await until(title, "pdk-2-sentry");
      press("K", document.body);
      await until(title, "driver");
    },
    { scenario: "load, follow a change, move the cursor" },
  );

  expectNoDiagnostics(artifact);
});

it("lists pdk-2-sentry's phases in order, each followed by its tasks", async () => {
  const { show } = await mount();
  dispose = show();
  await until(title, "driver");
  press("2", document.body);
  await until(title, "pdk-2-sentry");

  const rows = [...document.querySelectorAll<HTMLElement>(`${LIST} [data-kind]`)];
  const texts = rows.map((row) => String(row.textContent));

  expect(phasesOf(rows)).toEqual([
    ["00", ["00.1", "00.2", "00.3", "00.4", "00.5", "00.6", "00.7", "00.8", "00.9"]],
    ["01", ["01.1", "01.2", "01.3"]],
    ["02", ["02.1", "02.2"]],
    ["03a", ["03a.1", "03a.2", "03a.3", "03a.4", "03a.5", "03a.6", "03a.7"]],
    ["03b", ["03b.1", "03b.2", "03b.3"]],
    ["03c", ["03c.1", "03c.2", "03c.3"]],
    ["04", ["04.1"]],
  ]);
  expect(rows.map((row) => row.getAttribute("role"))).toEqual(rows.map(() => "option"));
  expect(texts[0]).toContain("pdk 2.0 — extension, preload, facade8/8");
  expect(texts[0]).toContain("Everything ships from t4-platform-lambda first.");
  expect(texts.find((text) => text.includes("03a.1"))).toContain("t4-coa");
});

const labelOf = (row: Element) => String(row.querySelector("[data-label]")?.textContent);

function phasesOf(rows: HTMLElement[]): [string, string[]][] {
  const phases: [string, string[]][] = [];
  for (const row of rows) {
    if (row.dataset.kind === "phase") phases.push([labelOf(row), []]);
    else phases.at(-1)?.[1].push(labelOf(row));
  }
  return phases;
}
