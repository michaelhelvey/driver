/** App-wide key bindings, by `KeyboardEvent.key`. `J` is Shift+J. */
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

const isFree = (event: KeyboardEvent) =>
  !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey;

/**
 * Runs the binding for a key press, unless something already handled it, it has a Control,
 * Command or Alt modifier, or it happened in a text input. Returns whether a binding ran.
 *
 * @example
 * handleKey({ t: toggleTheme }, event); // true for a plain `t` outside an input
 */
export function handleKey(keymap: Keymap, event: KeyboardEvent): boolean {
  const run = isFree(event) && !isTyping(event.target) ? keymap[event.key] : undefined;
  if (run === undefined) return false;
  event.preventDefault();
  run();
  return true;
}

/**
 * Listens for app keys on `target` and returns a function that stops. Listeners on focused
 * widgets run first, so a key a widget handles (the list's `j`/`k`) never reaches the keymap.
 *
 * @example
 * onSettled(() => bindKeymap(document, { t: toggleTheme }));
 */
export function bindKeymap(target: Document, keymap: Keymap): () => void {
  const listener = (event: KeyboardEvent) => handleKey(keymap, event);
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
