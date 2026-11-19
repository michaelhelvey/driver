const inDialog = () => document.activeElement?.closest("dialog, [role=dialog]") != null;

const focus = (el: HTMLElement) => {
  if (el !== document.activeElement) el.focus();
};

/**
 * Focuses the element `find()` returns once the current update has rendered: a microtask from
 * now, or, if it was not there yet, a task from now. It never takes focus out of an open dialog,
 * and once it has focused the element it does not try again, so it cannot pull focus back from
 * wherever the user went next.
 *
 * @example
 * view.setCursor(slug, "project");
 * focusSoon(() => document.querySelector(`[data-row="project"]`));
 */
export function focusSoon(find: () => HTMLElement | null | undefined): void {
  let done = false;
  const run = () => {
    const el = done || inDialog() ? null : find();
    if (!el) return;
    done = true;
    focus(el);
  };
  queueMicrotask(run);
  setTimeout(run);
}

/**
 * The row of the main list with this key, if it is on the page.
 *
 * @example
 * listRow("task:plugin-sitemap")?.focus();
 */
export function listRow(key: string | undefined): HTMLElement | null {
  return key === undefined
    ? null
    : document.querySelector<HTMLElement>(`main [role=listbox] [data-row="${CSS.escape(key)}"]`);
}
