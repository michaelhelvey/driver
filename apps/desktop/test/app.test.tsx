import { afterEach, expect, it } from "bun:test";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { App } from "../src/app.tsx";
import { memorySource } from "../src/source/memory.ts";
import { fixtureTree, until, withStatus } from "./fixtures.ts";

const SKILLS = "pdk-2-sentry/01-framework/02-t4-agent-skills.md";

const percent = () =>
  document.querySelector("[data-testid=headline-percent]")?.firstChild?.textContent;

const title = () => document.querySelector("h1")?.textContent;

const cursorRow = (list: string) =>
  document.querySelector(`[aria-label=${list}] [data-cursor]`)?.textContent;

const press = (key: string, target: Element | null = document.activeElement) =>
  (target ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

it("loads the fixtures, follows a file change and moves the list cursor, with no diagnostics", async () => {
  const tree = await fixtureTree();
  const source = memorySource("fixtures", tree);
  const root = document.body.appendChild(document.createElement("div"));

  const { artifact } = await captureArtifact(
    async () => {
      dispose = render(() => <App source={source} />, root);
      await until(title, "driver");

      press("2", document.body);
      await until(title, "pdk-2-sentry");
      await until(percent, "33");
      expect(document.body.textContent).toContain("9 of 27 tasks done · 1 skipped");

      source.write(SKILLS, withStatus(tree.get(SKILLS) ?? "", "done"));
      await until(percent, "37");
      expect(document.body.textContent).toContain("10 of 27 tasks done · 1 skipped");

      document.querySelector<HTMLElement>("[aria-label=Tasks] [tabindex='0']")?.focus();
      press("j");
      press("j");
      press("k");
      await until(() => cursorRow("Tasks")?.includes("extension crate (rust)"), true);
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
