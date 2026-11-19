/**
 * App-wide key bindings. A key is a chord, `KeyboardEvent.key` with its modifiers in front
 * (`j`, `J` for Shift+J, `ctrl+d`, `mod+k` for Command+K, `Escape`, `" "`), or a sequence of two
 * chords split by a space (`g g`, `g n`).
 */
export type Keymap = Readonly<Record<string, () => void>>;

const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * Whether a key press on `target` is typing, so app keys must leave it alone.
 *
 * @example
 * isTyping(document.querySelector("input")); // true
 */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) !== null;
}

const inDialog = (target: EventTarget | null) =>
  target instanceof Element && target.closest("dialog, [role=dialog]") !== null;

/**
 * The chord of a key press: its key with `mod+` (Command), `ctrl+` and `alt+` in front.
 *
 * @example
 * chordOf(new KeyboardEvent("keydown", { key: "k", metaKey: true })); // "mod+k"
 */
export function chordOf(event: KeyboardEvent): string {
  const mods = [event.metaKey && "mod", event.ctrlKey && "ctrl", event.altKey && "alt"];
  return [...mods.filter((mod) => mod !== false), event.key].join("+");
}

const CONTROL = "button, a[href], [role=button], [role=separator]";

const presses = (target: EventTarget | null, chord: string) =>
  (chord === "Enter" || chord === " ") &&
  target instanceof Element &&
  target.closest(CONTROL) !== null;

const types = (target: EventTarget | null, chord: string) =>
  isTyping(target) && !chord.startsWith("mod+");

const ignores = (event: KeyboardEvent, chord: string) =>
  event.defaultPrevented ||
  inDialog(event.target) ||
  presses(event.target, chord) ||
  types(event.target, chord);

const starts = (keymap: Keymap, chord: string) =>
  Object.keys(keymap).some((keys) => keys.startsWith(`${chord} `));

const lookup = (keymap: Keymap, pending: string | null, chord: string) =>
  (pending === null ? undefined : keymap[`${pending} ${chord}`]) ?? keymap[chord];

const take = (event: KeyboardEvent, run: (() => void) | undefined, taken: boolean) => {
  if (taken) event.preventDefault();
  run?.();
  return taken;
};

const pendingAfter = (keymap: Keymap, run: (() => void) | undefined, chord: string) =>
  run === undefined && starts(keymap, chord) ? chord : null;

/**
 * Reads key presses against a keymap. Keeps the first chord of a sequence pending until the
 * next press, and tells `onPending` when a sequence starts and ends.
 */
export type KeyReader = (event: KeyboardEvent) => boolean;

/**
 * Makes a {@link KeyReader} over `keymap`, read on every press so bindings can depend on state.
 * A press runs its binding unless something already handled it, it happened in a dialog, it is
 * Enter or Space on a control that those keys press (a button, a link, a resize handle), or it
 * is typing (only `mod+` chords run in text inputs). After the first chord of a sequence, the
 * next press runs the sequence if there is one, else its own binding. Returns whether a binding
 * ran or a sequence started.
 *
 * @example
 * const read = createKeyReader(() => ({ "g g": top, G: bottom }));
 * read(gEvent); read(gEvent); // top()
 */
export function createKeyReader(
  keymap: () => Keymap,
  onPending: (chord: string | null) => void = () => {},
): KeyReader {
  let pending: string | null = null;
  const settle = (next: string | null) => {
    if (pending !== next) onPending(next);
    pending = next;
  };
  return (event) => {
    const chord = chordOf(event);
    if (ignores(event, chord)) return false;
    const map = keymap();
    const run = lookup(map, pending, chord);
    settle(pendingAfter(map, run, chord));
    return take(event, run, run !== undefined || pending !== null);
  };
}

/**
 * Listens for app keys on `target` and returns a function that stops. Listeners on focused
 * widgets run first, so a key a widget handles (the list's `j`/`k`) never reaches the keymap.
 *
 * @example
 * onSettled(() => bindKeymap(document, () => ({ t: toggleTheme })));
 */
export function bindKeymap(
  target: Document,
  keymap: () => Keymap,
  onPending?: (chord: string | null) => void,
): () => void {
  const read = createKeyReader(keymap, onPending);
  const listener = (event: KeyboardEvent) => void read(event);
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
