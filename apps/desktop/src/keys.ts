import type { Keymap } from "./keymap.ts";

/** Everything a key can do. The app implements each; {@link KEYS} binds them. */
export type Actions = {
  down: () => void;
  up: () => void;
  top: () => void;
  bottom: () => void;
  halfDown: () => void;
  halfUp: () => void;
  firstNeedsYou: () => void;
  nextNeedsYou: () => void;
  fold: () => void;
  blocker: () => void;
  nextProject: () => void;
  prevProject: () => void;
  project: (index: number) => void;
  palette: () => void;
  projectFile: () => void;
  logFile: () => void;
  toggleReader: () => void;
  focusReader: () => void;
  raw: () => void;
  copyPath: () => void;
  copyReference: () => void;
  filter: () => void;
  sidebar: () => void;
  theme: () => void;
  help: () => void;
  /** Escape in the list: closes the reader, else clears the filter. */
  escape: () => void;
};

/** What a key does while focus is in the reader instead. */
export type ReaderActions = {
  scroll: (by: "line" | "half" | "end", sign: 1 | -1) => void;
  back: () => void;
};

/** One line of the keys sheet: the keys it shows, what they do, and what they bind. */
export type KeyRow = {
  show: readonly string[];
  does: string;
  bind: (actions: Actions) => Keymap;
};

const NUMBERS = Array.from({ length: 9 }, (_, i) => String(i + 1));

/**
 * The keys sheet (`?`), by group: every key the app binds, and nothing it does not.
 */
export const KEYS: readonly { group: string; rows: readonly KeyRow[] }[] = [
  {
    group: "move",
    rows: [
      {
        show: ["j", "k"],
        does: "down / up",
        bind: (a) => ({ j: a.down, k: a.up, ArrowDown: a.down, ArrowUp: a.up }),
      },
      { show: ["g g", "G"], does: "top / bottom", bind: (a) => ({ "g g": a.top, G: a.bottom }) },
      {
        show: ["^d", "^u"],
        does: "half page",
        bind: (a) => ({ "ctrl+d": a.halfDown, "ctrl+u": a.halfUp }),
      },
      { show: ["a"], does: "first thing that needs you", bind: (a) => ({ a: a.firstNeedsYou }) },
      {
        show: ["g n"],
        does: "next that needs you, any project",
        bind: (a) => ({ "g n": a.nextNeedsYou }),
      },
      { show: ["space"], does: "fold / unfold phase", bind: (a) => ({ " ": a.fold }) },
      { show: ["b"], does: "jump to blocker", bind: (a) => ({ b: a.blocker }) },
    ],
  },
  {
    group: "projects",
    rows: [
      {
        show: ["J", "K"],
        does: "next / prev project",
        bind: (a) => ({ J: a.nextProject, K: a.prevProject }),
      },
      {
        show: ["1", "…", "9"],
        does: "project by number",
        bind: (a) => Object.fromEntries(NUMBERS.map((n, i) => [n, () => a.project(i)])),
      },
      { show: ["⌘K"], does: "palette — everything", bind: (a) => ({ "mod+k": a.palette }) },
      {
        show: ["p"],
        does: "open project.md",
        bind: (a) => ({ p: a.projectFile, "g p": a.projectFile }),
      },
      { show: ["L"], does: "open log.md", bind: (a) => ({ L: a.logFile }) },
    ],
  },
  {
    group: "read",
    rows: [
      { show: ["↵"], does: "toggle reader", bind: (a) => ({ Enter: a.toggleReader }) },
      {
        show: ["tab", "l"],
        does: "focus reader",
        bind: (a) => ({ Tab: a.focusReader, l: a.focusReader }),
      },
      { show: ["h", "esc"], does: "back to list", bind: (a) => ({ Escape: a.escape }) },
      { show: ["r"], does: "raw file / rendered", bind: (a) => ({ r: a.raw }) },
      { show: ["y"], does: "copy file path", bind: (a) => ({ y: a.copyPath }) },
      {
        show: ["c"],
        does: "copy a reference for an agent",
        bind: (a) => ({ c: a.copyReference }),
      },
    ],
  },
  {
    group: "view",
    rows: [
      { show: ["/"], does: "filter tasks", bind: (a) => ({ "/": a.filter }) },
      { show: ["["], does: "toggle sidebar", bind: (a) => ({ "[": a.sidebar }) },
      { show: ["t"], does: "paper / cocoa theme", bind: (a) => ({ t: a.theme }) },
      { show: ["?"], does: "this", bind: (a) => ({ "?": a.help }) },
    ],
  },
];

/**
 * The keys while focus is in the list (or nowhere): every binding of {@link KEYS}.
 *
 * @example
 * bindKeymap(document, () => listKeys(actions));
 */
export function listKeys(actions: Actions): Keymap {
  return Object.assign({}, ...KEYS.flatMap(({ rows }) => rows.map((row) => row.bind(actions))));
}

/**
 * The keys while focus is in the reader: motion keys scroll it, `h`, Escape and Tab go back to
 * the list, and every other key does what it does in the list.
 *
 * @example
 * bindKeymap(document, () => (zone() === "reader" ? readerKeys(actions, reader) : listKeys(actions)));
 */
export function readerKeys(actions: Actions, reader: ReaderActions): Keymap {
  const { scroll, back } = reader;
  return {
    ...listKeys(actions),
    j: () => scroll("line", 1),
    ArrowDown: () => scroll("line", 1),
    k: () => scroll("line", -1),
    ArrowUp: () => scroll("line", -1),
    "ctrl+d": () => scroll("half", 1),
    "ctrl+u": () => scroll("half", -1),
    G: () => scroll("end", 1),
    "g g": () => scroll("end", -1),
    h: back,
    Escape: back,
    Tab: back,
  };
}
