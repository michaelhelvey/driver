import { describe, expect, it } from "bun:test";
import { bindKeymap } from "../src/keymap.ts";

const TARGETS: Record<string, string> = {
  body: "",
  button: "<button>b</button>",
  input: "<input />",
  textarea: "<textarea></textarea>",
  select: "<select><option>a</option></select>",
  editable: "<div contenteditable>e</div>",
  "inside editable": "<div contenteditable><b>e</b></div>",
};

const press = (target: string, init: KeyboardEventInit) => {
  document.body.innerHTML = TARGETS[target] ?? "";
  const ran: string[] = [];
  const stop = bindKeymap(document, { t: () => ran.push("t"), J: () => ran.push("J") });
  const el =
    document.body.querySelector("b, button, input, textarea, select, div") ?? document.body;
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  stop();
  return ran;
};

describe("bindKeymap", () => {
  it.each([
    ["body", { key: "t" }, ["t"]],
    ["button", { key: "t" }, ["t"]],
    ["body", { key: "J", shiftKey: true }, ["J"]],
    ["body", { key: "x" }, []],
    ["body", { key: "t", metaKey: true }, []],
    ["body", { key: "t", ctrlKey: true }, []],
    ["body", { key: "t", altKey: true }, []],
    ["input", { key: "t" }, []],
    ["textarea", { key: "t" }, []],
    ["select", { key: "t" }, []],
    ["editable", { key: "t" }, []],
    ["inside editable", { key: "t" }, []],
  ])("on %s, %p runs %p", (target, init, ran) => {
    expect(press(target, init)).toEqual(ran);
  });

  it("skips keys a widget already handled", () => {
    document.body.innerHTML = "<button>b</button>";
    const ran: string[] = [];
    const stop = bindKeymap(document, { t: () => ran.push("t") });
    const button = document.body.querySelector("button");
    button?.addEventListener("keydown", (event) => event.preventDefault());
    button?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }),
    );
    stop();
    expect(ran).toEqual([]);
  });
});
