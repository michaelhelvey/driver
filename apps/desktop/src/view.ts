import { createStore } from "solid-js";

/** The dialog over the page, if any. Only one is open at a time. */
export type Overlay = "none" | "help" | "palette";

/** What the user has done to the view: cursors, folds, the filter, and the reader. Nothing here is a file. */
export type ViewState = {
  /** The cursor row key of each project, by slug, once the user moved it. */
  cursors: Record<string, string>;
  /** Phases the user folded (`true`) or unfolded (`false`), by `<slug>/<phase id>`. Others keep their default. */
  folds: Record<string, boolean>;
  reader: { open: boolean; raw: boolean };
  /** The task filter of the open project. `editing` while its field has focus. */
  filter: { query: string; editing: boolean };
  overlay: Overlay;
  sidebar: boolean;
};

/** The view's state and the only ways to change it. */
export type View = {
  state: ViewState;
  /** Moves the cursor of a project. */
  setCursor: (slug: string, key: string) => void;
  /** Folds or unfolds a phase. */
  setFold: (slug: string, phaseId: string, folded: boolean) => void;
  /** Opens the reader on a row, or closes it when it already shows that row. */
  activate: (slug: string, key: string) => void;
  /** Moves the cursor of a project to a row and opens the reader on it. */
  open: (slug: string, key: string) => void;
  /** Switches between the raw file and the rendered one, and opens the reader. */
  toggleRaw: () => void;
  closeReader: () => void;
  setQuery: (query: string) => void;
  setEditing: (editing: boolean) => void;
  clearFilter: () => void;
  setOverlay: (overlay: Overlay) => void;
  toggleSidebar: () => void;
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
    folds: {},
    reader: { open: false, raw: false },
    filter: { query: "", editing: false },
    overlay: "none",
    sidebar: true,
  });
  return {
    state,
    setCursor: (slug, key) =>
      setState((draft) => {
        draft.cursors[slug] = key;
      }),
    setFold: (slug, phaseId, folded) =>
      setState((draft) => {
        draft.folds[`${slug}/${phaseId}`] = folded;
      }),
    activate: (slug, key) =>
      setState((draft) => {
        draft.reader.open = !(draft.reader.open && key === cursorKey());
        draft.cursors[slug] = key;
      }),
    open: (slug, key) =>
      setState((draft) => {
        draft.reader.open = true;
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
    setQuery: (query) =>
      setState((draft) => {
        draft.filter.query = query;
      }),
    setEditing: (editing) =>
      setState((draft) => {
        draft.filter.editing = editing;
      }),
    clearFilter: () =>
      setState((draft) => {
        draft.filter.query = "";
        draft.filter.editing = false;
      }),
    setOverlay: (overlay) =>
      setState((draft) => {
        draft.overlay = overlay;
      }),
    toggleSidebar: () =>
      setState((draft) => {
        draft.sidebar = !draft.sidebar;
      }),
  };
}
