import { render } from "@solidjs/web";
import { App, Unreadable } from "./app.tsx";
import type { FileSource } from "./source/source.ts";
import "./styles.css";
import { applySavedTheme } from "./theme.ts";

document.addEventListener("securitypolicyviolation", (event) =>
  console.error(`driver: the CSP blocked ${event.blockedURI} (${event.violatedDirective})`),
);
applySavedTheme();

const source = async (): Promise<FileSource> =>
  "__TAURI_INTERNALS__" in window
    ? (await import("./source/tauri.ts")).tauriSource()
    : (await import("./source/fixtures.ts")).fixtureSource();

const root = document.querySelector("#root");
if (root === null) throw new Error("no #root element");

try {
  const files = await source();
  render(() => <App source={files} />, root);
} catch (error) {
  console.error("driver: no root", error);
  const message = error instanceof Error ? error.message : String(error);
  render(() => <Unreadable message={message} />, root);
}
