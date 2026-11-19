# apps/desktop

The read-only Tauri v2 app. See [`docs/plan.md`](../../docs/plan.md) for what it is.

## Run it

| What                          | Command                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| The app on `~/.driver`        | `bun --cwd apps/desktop tauri dev`                               |
| The app on other projects     | `DRIVER_ROOT=/abs/path bun --cwd apps/desktop tauri dev`         |
| Browser dev on the fixtures   | `bun --cwd apps/desktop dev`, then open `http://localhost:1420/` |
| Unit and diagnostics tests    | `bun run test` (also part of `bun run validate`)                 |
| Every key in Chrome           | `bun run e2e:web` (also part of `bun run validate`)              |
| Real-window e2e (builds Rust) | `bun run e2e:desktop` (not part of `validate`)                   |

`DRIVER_ROOT` must be an absolute path, as for the MCP server; `~` is not expanded. A relative path
shows an error in the window.

## Layout

- `src/source/`: `FileSource` (`slugs`, `readProject`, `watch`). `tauri.ts` reads the disk through
  `tauri-plugin-fs`; `memory.ts` is an in-memory tree; `fixtures.ts` bundles
  `packages/core/fixtures` into one for browser dev.
- `src/projects.ts`: `followProjects` reads every project, then re-reads only the project a change
  touched, after 100ms of quiet. A project that fails to parse becomes an error entry.
- `src/list/`: the cursor list primitive (ui-sdk roving focus; `j`/`k`, arrows, Home/End, Enter).
  While it holds focus, a re-render that moves or replaces the focused row (a live file change) puts
  focus back on the cursor row.
- `src/rows.ts`: the rows of a project page, a discriminated union by `kind` (`project`,
  `attention`, `log`, `phase`, `task`), each with the file the reader shows; which rows a fold
  hides; which rows a filter query leaves; where the cursor lands when its row is gone or folded.
- `src/view.ts`: what the user did to the view (cursors, folds, reader open/raw, the filter, the
  open overlay, the sidebar). Not files.
- `src/project-page.tsx`, `src/sidebar.tsx`, `src/reader.tsx`, `src/status-line.tsx`: the page:
  sidebar, project page, reader and status line. `src/app.tsx` puts them in a
  `@ui-sdk/solid/resizable` split with `@ui-sdk/solid/scroll-area` panes.
- `src/markdown.ts`: `marked` with custom renderers (a faint `##` before headings, `$ ` before shell
  lines, task-list checkboxes). It escapes every piece of agent text (raw HTML shows as text, images
  as alt text, only `http(s):`/`mailto:` links get an `href`) and returns `SafeHtml`, the only thing
  `src/html.tsx` will put in the page.
- `src/theme.ts`: `paper` / `cocoa` on `<html data-theme>`, saved in `localStorage`; the tokens are
  CSS variables per theme in `src/styles.css`, exposed to Tailwind by its `@theme`.
- `src/keys.ts`: the keys sheet (`?`) as one table, by group: what each row shows and what it binds,
  so the sheet and the bindings cannot drift. `readerKeys` overrides the motion keys to scroll the
  reader while it has focus.
- `src/keymap.ts`: reads chords (`ctrl+d`, `mod+k`) and two-key sequences (`g g`, `g n`, `g p`)
  against a keymap. App keys never run in a text input (only `mod+` chords do), in a dialog, for
  Enter/Space on a button or handle, or for keys a widget handled; the list handles `j`/`k`/`↵`
  itself.
- `src/navigation.ts`: what each key does to the view. Every action that moves the cursor also
  focuses the cursor row (`src/focus.ts`), so the list's own keys keep working from there.
- `src/filter-bar.tsx`, `src/palette.tsx` (`@ui-sdk/solid/command` in a dialog), `src/help.tsx`
  (`@ui-sdk/solid/dialog`), `src/toasts.tsx` (`@ui-sdk/solid/toast`): `/`, `⌘K`, `?`, and what `y`,
  `c` and failures say.
- `src/clipboard.ts`: where `y` and `c` copy to. The real app writes through
  `tauri-plugin-clipboard-manager` (`src/clipboard-tauri.ts`, capability `allow-write-text` only);
  the browser build uses `navigator.clipboard`.
- `src-tauri/`: the fs and clipboard plugins and one `root` command. The `e2e` cargo feature adds
  the WebDriver plugin; plain builds never include it.

## Scripts

- `scripts/screenshot.ts <url> <out.png> [keys]`: screenshots the browser build in Chrome after
  pressing `keys` (comma separated, like `2,t` for pdk-2-sentry in the cocoa theme). Run the browser
  dev server first.
- `scripts/e2e.ts`: copies the fixtures to a temp `DRIVER_ROOT` and runs `wdio` (called by
  `bun run e2e:desktop` after the e2e build). The spec starts the real MCP server (`packages/mcp`)
  on that root and runs the plan's user verification steps 1–3 with keys only.
- `e2e/web/keyboard.pw.ts` (`bun run e2e:web`): Playwright, in the installed Chrome, against the
  browser build on its own dev server, on a free port so runs in several worktrees do not collide.
  One flow presses every key of the sheet with no mouse and checks what shows and which row has
  focus after each. It reads only the bundled fixtures and takes about 10s, so `validate` runs it;
  it needs Google Chrome installed (`channel: "chrome"`).

## e2e notes

`@wdio/tauri-service` checks window focus before each `$`/`findElement` through the
`tauri-plugin-wdio` plugin, which we do not install: each check waits 5s for it and logs
`Failed to get window states`. The service skips the check once a session has switched windows
itself, so `wdio.conf.ts` switches to the window it is already on in `before`. Specs still resolve
an element once (`getElement()`) before polling it, so timing assertions measure only the app.
