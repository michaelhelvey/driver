/**
 * Where `y` puts a file path and `c` a reference. The real app writes the system clipboard
 * through Tauri.
 */
export type Clipboard = {
  /** Replaces the clipboard's text. Rejects when the clipboard cannot be written. */
  writeText: (text: string) => Promise<void>;
};

/**
 * The browser's clipboard, for browser dev and the browser e2e tests.
 *
 * @example
 * await browserClipboard().writeText("/Users/me/.driver/pdk-2-sentry/log.md");
 */
export function browserClipboard(): Clipboard {
  return { writeText: async (text) => navigator.clipboard.writeText(text) };
}
