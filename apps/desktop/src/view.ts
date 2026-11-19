import { createStore } from "solid-js";

/** What the user has done to the view: cursors and folds. Nothing here is a file. */
export type ViewState = {
  /** The cursor row key of each project, by slug, once the user moved it. */
  cursors: Record<string, string>;
  /** Phases whose fold the user flipped from its default, by `<slug>/<phase id>`. */
  flipped: Record<string, boolean>;
};

/** The view's state and the only ways to change it. */
export type View = {
  state: ViewState;
  /** Moves the cursor of a project. */
  setCursor: (slug: string, key: string) => void;
  /** Folds an unfolded phase, or unfolds a folded one. */
  flipFold: (slug: string, phaseId: string) => void;
};

/**
 * Creates the view state of the app.
 *
 * @example
 * const view = createView();
 * view.flipFold("pdk-2-sentry", "pdk-2.0"); // the finished phase 00 unfolds
 */
export function createView(): View {
  const [state, setState] = createStore<ViewState>({ cursors: {}, flipped: {} });
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
  };
}
