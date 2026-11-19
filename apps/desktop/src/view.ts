import { createStore } from "solid-js";

/** What the user has done to the view: cursors, folds, and the reader. Nothing here is a file. */
export type ViewState = {
  /** The cursor row key of each project, by slug, once the user moved it. */
  cursors: Record<string, string>;
  /** Phases whose fold the user flipped from its default, by `<slug>/<phase id>`. */
  flipped: Record<string, boolean>;
  reader: { open: boolean; raw: boolean };
};

/** The view's state and the only ways to change it. */
export type View = {
  state: ViewState;
  /** Moves the cursor of a project. */
  setCursor: (slug: string, key: string) => void;
  /** Folds an unfolded phase, or unfolds a folded one. */
  flipFold: (slug: string, phaseId: string) => void;
  /** Opens the reader on a row, or closes it when it already shows that row. */
  activate: (slug: string, key: string) => void;
  /** Switches between the raw file and the rendered one, and opens the reader. */
  toggleRaw: () => void;
  closeReader: () => void;
};

/**
 * Creates the view state of the app. `cursorKey` reads the key of the row the cursor is on now,
 * which can differ from the stored one (a row that is gone, a task in a folded phase).
 *
 * @example
 * const view = createView(() => cursor()?.key);
 * view.activate("pdk-2-sentry", "attention:t4-coa"); // the reader opens on t4-coa
 * view.toggleRaw(); // the reader shows the file as it is on disk
 */
export function createView(cursorKey: () => string | undefined): View {
  const [state, setState] = createStore<ViewState>({
    cursors: {},
    flipped: {},
    reader: { open: false, raw: false },
  });
  return {
    state,
    setCursor: (slug, key) =>
      setState((draft) => {
        draft.cursors[slug] = key;
      }),
    flipFold: (slug, phaseId) =>
      setState((draft) => {
        draft.flipped[`${slug}/${phaseId}`] = !draft.flipped[`${slug}/${phaseId}`];
      }),
    activate: (slug, key) =>
      setState((draft) => {
        draft.reader.open = !(draft.reader.open && key === cursorKey());
        draft.cursors[slug] = key;
      }),
    toggleRaw: () =>
      setState((draft) => {
        draft.reader.raw = !draft.reader.raw;
        draft.reader.open = true;
      }),
    closeReader: () =>
      setState((draft) => {
        draft.reader.open = false;
      }),
  };
}
