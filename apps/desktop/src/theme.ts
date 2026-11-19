const KEY = "driver-theme";
const THEMES = ["paper", "cocoa"] as const;

/** A color theme, set as `data-theme` on `<html>`. */
export type Theme = (typeof THEMES)[number];

const isTheme = (value: string | null): value is Theme => THEMES.some((theme) => theme === value);

const setTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
};

/**
 * Applies the saved theme, or `cocoa` when the system is dark and nothing is saved. Call it once
 * before the first render.
 *
 * @example
 * applySavedTheme();
 * render(() => <App source={source} />, root);
 */
export function applySavedTheme(): void {
  const saved = localStorage.getItem(KEY);
  const system = matchMedia("(prefers-color-scheme: dark)").matches ? "cocoa" : "paper";
  document.documentElement.dataset.theme = isTheme(saved) ? saved : system;
}

/**
 * Switches between `paper` and `cocoa`, and saves the choice.
 *
 * @example
 * bindKeymap(document, { t: toggleTheme });
 */
export function toggleTheme(): void {
  setTheme(document.documentElement.dataset.theme === "cocoa" ? "paper" : "cocoa");
}
