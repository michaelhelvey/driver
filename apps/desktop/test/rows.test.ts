import { describe, expect, it } from "bun:test";
import { parseProject } from "@driver/core";
import {
  cursorRow,
  isFinished,
  referenceOf,
  rowsOf,
  visibleRows,
  type Folded,
} from "../src/rows.ts";
import { fixtureTree } from "./fixtures.ts";

const tree = await fixtureTree();
const project = (slug: string) =>
  parseProject(
    new Map(
      [...tree]
        .filter(([path]) => path.startsWith(`${slug}/`))
        .map(([path, text]) => [path.slice(slug.length + 1), text]),
    ),
  );

const pinion = project("pinion-2-plugins");
const rows = rowsOf(pinion);
const byDefault: Folded = (id) =>
  isFinished(pinion.phases.find((p) => p.id === id) ?? pinion.phases[0]!);
const none: Folded = () => false;

describe("rowsOf", () => {
  it("puts the header, attention rows and log before the phases", () => {
    expect(rows.slice(0, 6).map((row) => row.key)).toEqual([
      "project",
      "attention:pinion-docs",
      "attention:plugin-images",
      "attention:plugin-embeds",
      "log",
      "phase:pinion-2.0",
    ]);
  });

  it.each<{ slug: string; first: string[] }>([
    {
      slug: "billing-ledger-v2",
      first: [
        "project",
        "attention:pr-backfill",
        "attention:reconcile-job",
        "attention:read-flag",
        "phase:discovery",
      ],
    },
    {
      slug: "onboarding-docs",
      first: ["project", "phase:outline", "task:week-one-path", "phase:drafts"],
    },
  ])("leaves out the log row when $slug has no log entries", ({ slug, first }) => {
    expect(
      rowsOf(project(slug))
        .slice(0, first.length)
        .map((row): string => row.key),
    ).toEqual(first);
  });

  it("gives every row the file the reader shows", () => {
    expect(rows.find((row) => row.key === "attention:plugin-embeds")?.path).toBe(
      "03c-core-bump/02-plugin-embeds.md",
    );
    expect(rows.find((row) => row.key === "phase:canaries")?.path).toBe("02-canaries/phase.md");
  });
});

describe("cursorRow", () => {
  it.each([
    { name: "no cursor yet", key: null, folded: none, want: "attention:pinion-docs" },
    {
      name: "a row that is there",
      key: "task:plugin-sitemap",
      folded: none,
      want: "task:plugin-sitemap",
    },
    {
      name: "a row that is gone",
      key: "task:renamed",
      folded: none,
      want: "attention:pinion-docs",
    },
    {
      name: "a task in a folded phase",
      key: "task:plan-doc",
      folded: byDefault,
      want: "phase:pinion-2.0",
    },
    { name: "a task in an open phase", key: "task:plan-doc", folded: none, want: "task:plan-doc" },
  ])("$name → $want", ({ key, folded, want }) => {
    expect(cursorRow(rows, key, folded)?.key).toBe(want);
  });

  it("falls back to the header when nothing needs the user", () => {
    expect(cursorRow(rowsOf(project("onboarding-docs")), null, none)?.key).toBe("project");
  });
});

describe("referenceOf", () => {
  const titled = { ...pinion, meta: { ...pinion.meta, title: "Plugin rollout" } };
  it.each([
    ["project", "re pinion-2-plugins (Plugin rollout): /r/x.md"],
    ["attention:plugin-embeds", "re plugin-embeds (plugin-embeds): /r/x.md"],
    ["log", "re log (Plugin rollout): /r/x.md"],
    ["phase:pinion-2.0", "re pinion-2.0 (pinion 2.0 — sandbox, preload, facade): /r/x.md"],
    ["task:plan-doc", "re plan-doc (plan doc): /r/x.md"],
  ])("%s → %s", (key, want) => {
    const row = rows.find((candidate) => candidate.key === key);
    expect(row && referenceOf(row, "pinion-2-plugins", titled, "/r/x.md")).toBe(want);
  });
});

describe("visibleRows", () => {
  it("hides the tasks of folded phases only", () => {
    const hidden = rows.length - visibleRows(rows, byDefault).length;
    expect(hidden).toBe(9);
  });
});
