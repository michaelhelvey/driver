# apps/desktop

The read-only Tauri v2 app. See [`docs/plan.md`](../../docs/plan.md) for what it is.

## Run it

| What                          | Command                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| The app on `~/.driver`        | `bun --cwd apps/desktop tauri dev`                               |
| The app on other projects     | `DRIVER_ROOT=/abs/path bun --cwd apps/desktop tauri dev`         |
| Browser dev on the fixtures   | `bun --cwd apps/desktop dev`, then open `http://localhost:1420/` |
| Unit and diagnostics tests    | `bun run test` (also part of `bun run validate`)                 |
| Real-window e2e (builds Rust) | `bun run e2e:desktop` (not part of `validate`)                   |

`DRIVER_ROOT` must be an absolute path, as for the MCP server; `~` is not expanded. A relative path
shows an error in the window.

## Layout

- `src/source/`: `FileSource` (`readTree`, `readProject`, `watch`). `tauri.ts` reads the disk
  through `tauri-plugin-fs`; `memory.ts` is an in-memory tree; `fixtures.ts` bundles
  `packages/core/fixtures` into one for browser dev.
- `src/projects.ts`: `followProjects` reads every project, then re-reads only the project a change
  touched, after 100ms of quiet. A project that fails to parse becomes an error entry.
- `src/list/`: the cursor list primitive (ui-sdk roving focus; `j`/`k`, arrows, Home/End, Enter).
- `src/rows.ts`: the rows of a project page, a discriminated union by `kind`.
- `src/keymap.ts`: app keys, skipped in text inputs and for keys a widget handled.
- `src-tauri/`: the fs plugin and one `root` command. The `e2e` cargo feature adds the WebDriver
  plugin; plain builds never include it.

## Scripts

- `scripts/screenshot.ts <url> <out.png> [keys]`: screenshots the browser build in Chrome after
  pressing `keys` (comma separated, like `2,t` for pdk-2-sentry in the cocoa theme). Run the browser
  dev server first.
- `scripts/e2e.ts`: copies the fixtures to a temp `DRIVER_ROOT` and runs `wdio` (called by
  `bun run e2e:desktop` after the e2e build).

## e2e notes

`@wdio/tauri-service` checks window focus before each `$`/`findElement` by calling a
`tauri-plugin-wdio` command we do not install, so each lookup waits 5s and logs a
`Failed to get window states` warning. Specs resolve an element once (`getElement()`) before polling
it, so timing assertions measure the app, not that wait.
