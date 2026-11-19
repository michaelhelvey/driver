import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { KEYS } from "../src/keys.ts";

const README = join(import.meta.dir, "..", "..", "..", "README.md");

const shownKeys = (cell: string) =>
  [...cell.matchAll(/`([^`]+)`|…/g)].map((match) => match[1] ?? "…").join(" ");

const keysTable = (markdown: string): string[] => {
  const table = markdown
    .split("### Keys")[1]
    ?.split("\n\n")
    .find((block) => block.startsWith("|"));
  return (table ?? "")
    .split("\n")
    .slice(2)
    .map((line) => line.split("|").map((part) => part.trim()))
    .map((cells) => `${cells[1]} | ${shownKeys(cells[2] ?? "")} | ${cells[3]}`);
};

describe("the README's keys table", () => {
  it("is the keys sheet, row for row", async () => {
    const sheet = KEYS.flatMap(({ group, rows }) =>
      rows.map((row, i) => `${i === 0 ? group : ""} | ${row.show.join(" ")} | ${row.does}`),
    );
    expect(keysTable(await Bun.file(README).text())).toEqual(sheet);
  });
});
