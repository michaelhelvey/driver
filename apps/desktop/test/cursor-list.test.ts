import { describe, expect, it } from "bun:test";
import { checkPattern, mount } from "@ui-sdk/core/testing";
import { cursorList, type CursorListOptions } from "../src/list/cursor-list.ts";

const MARKUP = `<root aria-label="Rows">${["a", "b", "c", "d"]
  .map((key) => `<row value="${key}">${key}</row>`)
  .join("")}</root>`;

const withList = async (
  options: CursorListOptions,
  run: (view: ReturnType<typeof mount<typeof cursorList>>) => Promise<void>,
) => {
  const view = mount(cursorList, options, MARKUP);
  try {
    await run(view);
  } finally {
    view.unmount();
  }
};

const tabbable = (view: ReturnType<typeof mount<typeof cursorList>>) =>
  ["a", "b", "c", "d"].filter((key) => view.part("row", key)?.getAttribute("tabindex") === "0");

describe("cursorList", () => {
  it.each([
    [["j"], "b"],
    [["j", "j", "k"], "b"],
    [["ArrowDown", "ArrowDown"], "c"],
    [["End"], "d"],
    [["End", "Home"], "a"],
    [["k"], "a"],
    [["End", "j"], "d"],
  ])("moves the cursor with %p to %p", async (keys, cursor) => {
    await withList({ defaultCursor: "a" }, async (view) => {
      await view.keys("Tab", ...keys);
      expect(view.state.cursor).toBe(cursor);
      expect(document.activeElement?.textContent).toBe(cursor);
      expect(tabbable(view)).toEqual([cursor]);
      expect(view.part("row", cursor)?.getAttribute("aria-selected")).toBe("true");
    });
  });

  it("leaves other letters and modified keys to the app", async () => {
    await withList({ defaultCursor: "a" }, async (view) => {
      await view.keys("Tab", "J", "g", "Control+j", "b");
      expect(view.state.cursor).toBe("a");
    });
  });

  it("activates the cursor row on Enter and on click", async () => {
    const activated: string[] = [];
    await withList(
      { defaultCursor: "a", onActivate: (key) => activated.push(key) },
      async (view) => {
        await view.keys("Tab", "j", "Enter");
        await view.click(view.part("row", "d") ?? document.body);
        expect(activated).toEqual(["b", "d"]);
        expect(view.state.cursor).toBe("d");
      },
    );
  });

  it("reports moves to a controlled owner, which keeps the cursor", async () => {
    const changes: [string, string][] = [];
    const onCursorChange: CursorListOptions["onCursorChange"] = (cursor, details) =>
      changes.push([cursor, details.reason]);
    await withList({ cursor: "b", onCursorChange }, async (view) => {
      await view.keys("Tab");
      expect(document.activeElement?.textContent).toBe("b");
      await view.keys("j");
      expect(changes).toEqual([["c", "list-navigation"]]);
      expect(view.state.cursor).toBe("b");
    });
  });

  it("is a listbox, without type-ahead: letters belong to the app's keymap", async () => {
    await withList({ defaultCursor: "a" }, async (view) => {
      const error = await checkPattern(view.root, "listbox").catch((e: unknown) => e);
      expect(String(error)).toMatch(
        /found 1 problem with the listbox pattern:\n- .*type-ahead\)\.$/,
      );
    });
  });
});
