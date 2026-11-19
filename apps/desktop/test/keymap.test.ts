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

const pressOn = (target: Element | null, key: string) =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

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

  it.each([
    ["widget", "j"],
    ["input", "j"],
    ["dialog", "j"],
    ["control", "Enter"],
  ])(
    "ends a pending g when the next press goes to a %s instead, so g g needs two more g",
    (at, key) => {
      document.body.innerHTML = `<div data-at="widget" tabindex="0"></div><input data-at="input"><div role="dialog"><i data-at="dialog"></i></div><button data-at="control"></button>`;
      document
        .querySelector("[data-at=widget]")
        ?.addEventListener("keydown", (event) => event.preventDefault());
      const ran: string[] = [];
      const pending: (string | null)[] = [];
      const stop = bindKeymap(
        document,
        () => KEYMAP(ran),
        (chord) => pending.push(chord),
      );
      pressOn(document.body, "g");
      pressOn(document.querySelector(`[data-at=${at}]`), key);
      pressOn(document.body, "g");
      stop();
      expect({ ran, pending }).toEqual({ ran: [], pending: ["g", null, "g"] });
    },
  );

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

const copyReference = () => void "copy";

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

  it("shows c in the keys sheet and binds it to copy a reference", () => {
    const row = KEYS.flatMap(({ rows }) => rows).find((r) => r.show.includes("c"));
    expect(row?.does).toBe("copy a reference for an agent");
    expect(
      row?.bind(
        new Proxy(actions, {
          get: (_, key) => (key === "copyReference" ? copyReference : () => {}),
        }),
      ),
    ).toEqual({ c: copyReference });
  });

  it("binds nothing to o", () => {
    expect(Object.keys(keymap)).not.toContain("o");
  });
});
