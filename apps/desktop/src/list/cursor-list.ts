import {
  createChange,
  createRovingFocus,
  definePrimitive,
  keepFocus,
  type ChangeDetails,
  type RovingFocusMoveContext,
} from "@ui-sdk/core";

/** Options of {@link cursorList}. `cursor` is controlled; leave it out to start at `defaultCursor`. */
export type CursorListOptions = {
  cursor?: string | null;
  defaultCursor?: string | null;
  onCursorChange?: (
    cursor: string,
    details: ChangeDetails<"item-press" | "list-navigation">,
  ) => void;
  onActivate?: (key: string) => void;
};

const STEPS: Readonly<Record<string, number>> = {
  j: 1,
  ArrowDown: 1,
  k: -1,
  ArrowUp: -1,
  Home: -Infinity,
  End: Infinity,
};

const stepOf = (event: KeyboardEvent): number | undefined =>
  event.altKey || event.ctrlKey || event.metaKey ? undefined : STEPS[event.key];

const move = (
  event: KeyboardEvent,
  { from, items }: RovingFocusMoveContext,
): string | undefined => {
  const step = stepOf(event);
  if (step === undefined) return undefined;
  const index = items.findIndex((item) => item.key === from.key) + step;
  return items[Math.min(Math.max(index, 0), items.length - 1)]?.key;
};

/**
 * The main keyboard list: rows with a single cursor that `j`/`k`, the arrows, Home and End move,
 * and Enter or a click activates. The list is one tab stop, on the cursor row. It renders as a
 * WAI-ARIA listbox whose selection follows the cursor. Letter keys other than `j`/`k` are left
 * to the app's keymap (no typeahead). Each row carries its key as `data-row`.
 *
 * Focus stays on the cursor row while rows re-render under it: a live file change can move the
 * focused row (a reorder) or replace it, and browsers drop focus to the page without a reliable
 * event when that happens. While the list holds focus (focus went into a row and did not go to
 * another element on purpose), any change to the rows puts focus back on the cursor row.
 *
 * @example
 * const { Root: CursorList, Row: CursorListRow } = createParts(cursorList, { root: "div", row: "div" });
 * <CursorList aria-label="Tasks" onActivate={(id) => open(id)}>
 *   <CursorListRow value="t4-coa">t4-coa</CursorListRow>
 * </CursorList>
 */
export const cursorList = definePrimitive({
  name: "cursor-list",
  options: {
    cursor: "string",
    defaultCursor: "string",
    onCursorChange: "callback",
    onActivate: "callback",
  },
  controlled: ["cursor"],
  state: (options: CursorListOptions) => ({
    cursor: options.cursor ?? options.defaultCursor ?? null,
    focused: null as string | null,
  }),
  sync: (options) => (options.cursor === undefined ? {} : { cursor: options.cursor }),
  api: (context) => {
    const change = createChange(context);
    const cursorRow = () => {
      const { cursor } = context.store.get();
      return cursor === null ? undefined : context.element("row", cursor);
    };
    let holding = false;
    const roving = createRovingFocus(context, {
      slot: "row",
      key: "focused",
      remember: false,
      move,
      preferred: (row) => row.key === context.store.get().cursor,
      claims: (state, row) => state.cursor === null || row.key === state.cursor,
    });
    const activate = (key: string, event?: Event) => {
      change("cursor", key, { reason: "item-press", event });
      context.options().onActivate?.(key);
    };
    return {
      roving,
      activate,
      hold: (held: boolean) => {
        holding = held;
      },
      watch(el: HTMLElement) {
        const observer = new MutationObserver(() => {
          if (holding) keepFocus(cursorRow);
        });
        observer.observe(el, { childList: true, subtree: true });
        return () => observer.disconnect();
      },
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        const moved = roving.keydown(event, el);
        if (moved !== undefined) {
          event.preventDefault();
          change("cursor", moved.key, { reason: "list-navigation", event });
        } else if (event.key === "Enter") {
          event.preventDefault();
          activate(key, event);
        }
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "listbox",
      keys: { none: "Each row handles the keys that move the cursor." },
      bind: (el, part) => part.api.watch(el),
    }),
    row: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-selected": String(state.cursor === part.key),
        "data-cursor": state.cursor === part.key ? "" : undefined,
        "data-row": part.key,
      }),
      press: ({ api, key }, event) => api.activate(key, event),
      on: {
        keydown: (event, { el, api, key }) => {
          if (el) api.keydown(event, el, key);
        },
        focusin: (_, { api }) => api.hold(true),
        focusout: (event, { api }) =>
          api.hold(event instanceof FocusEvent && event.relatedTarget === null),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
});
