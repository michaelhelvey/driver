import { describe, expect, it } from "bun:test";
import { parseProject } from "@driver/core";
import { cursorRow, isFinished, rowsOf, visibleRows, type Folded } from "../src/rows.ts";
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

const pdk = project("pdk-2-sentry");
const rows = rowsOf(pdk);
const byDefault: Folded = (id) => isFinished(pdk.phases.find((p) => p.id === id) ?? pdk.phases[0]!);
const none: Folded = () => false;

describe("rowsOf", () => {
  it("puts the header, attention rows and log before the phases", () => {
    expect(rows.slice(0, 6).map((row) => row.key)).toEqual([
      "project",
      "attention:t4-agent-skills",
      "attention:t4-authorization-platform",
      "attention:t4-user-info",
      "log",
      "phase:pdk-2.0",
    ]);
  });

  it.each<{ slug: string; first: string[] }>([
    {
      slug: "billing-ledger-v2",
      first: ["project", "attention:pr-backfill", "attention:reconcile-job", "phase:discovery"],
    },
    {
      slug: "onboarding-docs",
      first: ["project", "phase:outline", "task:week-one-path", "phase:drafts"],
    },
  ])("leaves out the log row when $slug has no log entries", ({ slug, first }) => {
    expect(
      rowsOf(project(slug))
        .slice(0, 4)
        .map((row): string => row.key),
    ).toEqual(first);
  });

  it("gives every row the file the reader shows", () => {
    expect(rows.find((row) => row.key === "attention:t4-user-info")?.path).toBe(
      "03c-pdk-bump/02-t4-user-info.md",
    );
    expect(rows.find((row) => row.key === "phase:canaries")?.path).toBe("02-canaries/phase.md");
  });
});

describe("cursorRow", () => {
  it.each([
    { name: "no cursor yet", key: null, folded: none, want: "attention:t4-agent-skills" },
    { name: "a row that is there", key: "task:t4-coa", folded: none, want: "task:t4-coa" },
    {
      name: "a row that is gone",
      key: "task:renamed",
      folded: none,
      want: "attention:t4-agent-skills",
    },
    {
      name: "a task in a folded phase",
      key: "task:plan-doc",
      folded: byDefault,
      want: "phase:pdk-2.0",
    },
    { name: "a task in an open phase", key: "task:plan-doc", folded: none, want: "task:plan-doc" },
  ])("$name → $want", ({ key, folded, want }) => {
    expect(cursorRow(rows, key, folded)?.key).toBe(want);
  });

  it("falls back to the header when nothing needs the user", () => {
    expect(cursorRow(rowsOf(project("onboarding-docs")), null, none)?.key).toBe("project");
  });
});

describe("visibleRows", () => {
  it("hides the tasks of folded phases only", () => {
    const hidden = rows.length - visibleRows(rows, byDefault).length;
    expect(hidden).toBe(9);
  });
});
