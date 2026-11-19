import { render } from "@solidjs/web";
import { App, Unreadable } from "./app.tsx";
import { browserClipboard, type Clipboard } from "./clipboard.ts";
import type { FileSource } from "./source/source.ts";
import "./styles.css";
import { applySavedTheme } from "./theme.ts";

document.addEventListener("securitypolicyviolation", (event) =>
  console.error(`driver: the CSP blocked ${event.blockedURI} (${event.violatedDirective})`),
);
applySavedTheme();

const inTauri = "__TAURI_INTERNALS__" in window;

const source = async (): Promise<FileSource> =>
  inTauri
    ? (await import("./source/tauri.ts")).tauriSource()
    : (await import("./source/fixtures.ts")).fixtureSource();

const clipboard = async (): Promise<Clipboard> =>
  inTauri ? (await import("./clipboard-tauri.ts")).tauriClipboard() : browserClipboard();

const root = document.querySelector("#root");
if (root === null) throw new Error("no #root element");

try {
  const [files, copy] = await Promise.all([source(), clipboard()]);
  render(() => <App source={files} clipboard={copy} />, root);
} catch (error) {
  console.error("driver: no root", error);
  const message = error instanceof Error ? error.message : String(error);
  render(() => <Unreadable message={message} />, root);
}
