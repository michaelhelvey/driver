import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Clipboard } from "./clipboard.ts";

/**
 * The system clipboard, through `tauri-plugin-clipboard-manager`. The app may only write text to
 * it (`clipboard-manager:allow-write-text`).
 *
 * @example
 * await tauriClipboard().writeText(path);
 */
export function tauriClipboard(): Clipboard {
  return { writeText: async (text) => writeText(text) };
}
