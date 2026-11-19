import { describe, expect, it } from "bun:test";
import { bindKeymap } from "../src/keymap.ts";
import { KEYS, listKeys, readerKeys, type Actions } from "../src/keys.ts";

const TARGETS: Record<string, string> = {
  body: "",
  button: "<button>b</button>",
  input: "<input />",
  textarea: "<textarea></textarea>",
  select: "<select><option>a</option></select>",
  editable: "<div contenteditable>e</div>",
  "inside editable": "<div contenteditable><b>e</b></div>",
  dialog: "<div role='dialog'><button>b</button></div>",
  handle: "<div role='separator' tabindex='0'></div>",
};

const KEYMAP = (ran: string[]) => ({
  t: () => ran.push("t"),
  J: () => ran.push("J"),
  " ": () => ran.push("space"),
  Enter: () => ran.push("Enter"),
  Escape: () => ran.push("Escape"),
  G: () => ran.push("G"),
  "g g": () => ran.push("top"),
  "g n": () => ran.push("next"),
  "ctrl+d": () => ran.push("half"),
  "mod+k": () => ran.push("palette"),
});

const pressAll = (target: string, presses: KeyboardEventInit[]) => {
  document.body.innerHTML = TARGETS[target] ?? "";
  const ran: string[] = [];
  const pending: (string | null)[] = [];
  const stop = bindKeymap(
    document,
    () => KEYMAP(ran),
    (chord) => pending.push(chord),
  );
  const el = [...document.body.querySelectorAll(":not(option)")].at(-1) ?? document.body;
  for (const init of presses) {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  }
  stop();
  return { ran, pending };
};

const press = (target: string, init: KeyboardEventInit) => pressAll(target, [init]).ran;

describe("bindKeymap", () => {
  it.each([
    ["body", { key: "t" }, ["t"]],
    ["button", { key: "t" }, ["t"]],
    ["body", { key: "J", shiftKey: true }, ["J"]],
    ["body", { key: "x" }, []],
    ["body", { key: "t", metaKey: true }, []],
    ["body", { key: "t", ctrlKey: true }, []],
    ["body", { key: "t", altKey: true }, []],
    ["body", { key: "d", ctrlKey: true }, ["half"]],
    ["body", { key: "k", metaKey: true }, ["palette"]],
    ["input", { key: "t" }, []],
    ["input", { key: "k", metaKey: true }, ["palette"]],
    ["input", { key: "d", ctrlKey: true }, []],
    ["textarea", { key: "t" }, []],
    ["select", { key: "t" }, []],
    ["editable", { key: "t" }, []],
    ["inside editable", { key: "t" }, []],
    ["dialog", { key: "t" }, []],
    ["dialog", { key: "k", metaKey: true }, []],
    ["body", { key: " " }, ["space"]],
    ["body", { key: "Enter" }, ["Enter"]],
    ["button", { key: "Enter" }, []],
    ["button", { key: " " }, []],
    ["handle", { key: "Enter" }, []],
    ["handle", { key: "t" }, ["t"]],
    ["body", { key: "Escape" }, ["Escape"]],
    ["input", { key: " " }, []],
    ["input", { key: "Escape" }, []],
    ["textarea", { key: " " }, []],
    ["editable", { key: " " }, []],
    ["inside editable", { key: "Escape" }, []],
  ])("on %s, %p runs %p", (target, init, ran) => {
    expect(press(target, init)).toEqual(ran);
  });

  it.each([
    [["g", "g"], ["top"], ["g", null]],
    [["g", "n"], ["next"], ["g", null]],
    [["g", "t"], ["t"], ["g", null]],
    [["g", "x", "t"], ["t"], ["g", null]],
    [["G"], ["G"], []],
    [
      ["g", "g", "g", "g"],
      ["top", "top"],
      ["g", null, "g", null],
    ],
  ])("reads the sequence %p as %p", (keys, ran, pending) => {
    const result = pressAll(
      "body",
      keys.map((key) => ({ key })),
    );
    expect(result).toEqual({ ran, pending });
  });

  it("skips keys a widget already handled", () => {
    document.body.innerHTML = "<button>b</button>";
    const ran: string[] = [];
    const stop = bindKeymap(document, () => ({ t: () => ran.push("t") }));
    const button = document.body.querySelector("button");
    button?.addEventListener("keydown", (event) => event.preventDefault());
    button?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }),
    );
    stop();
    expect(ran).toEqual([]);
  });
});

const SHOWN_AS: Readonly<Record<string, string[]>> = {
  "…": [],
  "⌘K": ["mod+k"],
  "^d": ["ctrl+d"],
  "^u": ["ctrl+u"],
  space: [" "],
  "↵": ["Enter"],
  tab: ["Tab"],
  esc: ["Escape"],
};

const chordsOf = (shown: string): string[] => SHOWN_AS[shown] ?? [shown];

describe("KEYS", () => {
  const actions = new Proxy({} as Actions, { get: () => () => {} });
  const keymap = {
    ...listKeys(actions),
    ...readerKeys(actions, { scroll: () => {}, back: () => {} }),
  };

  it.each(KEYS.flatMap(({ rows }) => rows.flatMap((row) => row.show.flatMap(chordsOf))))(
    "binds %p, which the keys sheet shows",
    (chord) => {
      expect(Object.keys(keymap)).toContain(chord);
    },
  );

  it("binds nothing for c and o, which come with Rex", () => {
    expect(Object.keys(keymap).filter((key) => ["c", "o"].includes(key))).toEqual([]);
  });
});
