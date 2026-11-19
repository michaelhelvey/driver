---
name: verify-driver
description:
  Every way to check a change to driver (the MCP server, the core, or the desktop app) works, from
  the one command that must be green to the steps a person follows to accept it. Use before
  declaring any driver change done, and when writing verification steps for the user.
---

# Verify driver

Run the levers that cover what you changed, from the repo root. `bun run validate` is always one of
them. Kill every process you start (dev servers, `tauri dev`) and check with
`pgrep -fl 'vite|wdio|tauri|playwright'` before you finish.

## `bun run validate` (always)

Must be green before work is done. In order, and it stops at the first failure:

1. `vp check`: `vp fmt` (format check), `vp lint` (oxlint with `eslint-plugin-solid` v2 rules) and
   the type check, configured in `vite.config.ts`. `bun run format` and `bun run lint` fix what they
   can.
2. `bun run test`: `bun test ./packages` (core table tests on `packages/core/fixtures`, the MCP disk
   adapter, and the MCP stdio e2e below), then the desktop unit and diagnostics tests
   (`apps/desktop/test`, happy-dom, `expectNoDiagnostics` from `@solidjs/diagnostics`), including
   `readme.test.ts`, which fails when the README's keys table drifts from `KEYS`.
3. `bun run e2e:web`: Playwright drives the browser build on the bundled fixtures with the keyboard
   only (`apps/desktop/e2e/web/keyboard.pw.ts`): every key of the `?` sheet, what shows, which row
   has focus, the clipboard text of `y` and `c`, and no console errors. It starts its own dev server
   on a free port and runs in the installed Google Chrome (`channel: "chrome"`), so Chrome must be
   installed. About 10s.

A test that prints `error: ENOENT mid-rename` and still passes is expected: it simulates a read
during a rename.

## `bun run e2e:desktop` (the real window)

Not part of `validate`, because it builds Rust (`tauri build --debug --no-bundle --features e2e`,
about a minute warm, several cold). Run it after any change to `apps/desktop/src-tauri`, the Tauri
`FileSource`, the clipboard, the CSP, or the live-reload path, and before handing over a desktop
change.

`apps/desktop/scripts/e2e.ts` copies the fixtures to a temp `DRIVER_ROOT` and runs WebdriverIO
(`@wdio/tauri-service`) against the real WebKit window. The spec
(`apps/desktop/e2e/specs/live-reload.e2e.ts`) starts the real MCP server on that root and runs the
user acceptance steps below with keys only, checks the fs scope (reads only under `DRIVER_ROOT`,
writes nowhere), the CSP, the `t` theme across a reload, and that `y` and `c` put the absolute path
and the reference on the system clipboard (read back with `pbpaste`, since the app cannot read it).
**It writes to the real system clipboard**: expect yours to change.

## MCP server over stdio

`bun test packages/mcp`: `e2e.test.ts` spawns `bun packages/mcp/src/main.ts` over real stdio with
the MCP client SDK against a temp copy of the fixtures, calls every tool, asserts the files on disk
and a re-parse, and runs two `apply` calls at once. It is part of `bun run test`; run it alone after
a change to `packages/mcp` or the tool descriptions in `packages/core/src/tools.ts`.

By hand: `DRIVER_ROOT=$(mktemp -d) bun packages/mcp/src/main.ts` prints `{"started":"…"}` to stderr
and waits for MCP messages on stdin. Each tool call logs one JSON line to stderr.

## Browser dev build

`bun --cwd apps/desktop dev`, then open `http://localhost:1420/` (strict port: it fails if 1420 is
taken). The browser build reads the bundled `packages/core/fixtures` from memory, so nothing on disk
changes. Use it to look at a UI change;
`bun apps/desktop/scripts/screenshot.ts <url> <out.png> [keys]` screenshots it in Chrome after
pressing keys (comma separated, e.g. `2,t`).

## The app on real files

- `bun --cwd apps/desktop tauri dev`: the app on `~/.driver`.
- `DRIVER_ROOT=$PWD/packages/core/fixtures bun --cwd apps/desktop tauri dev`: on the fixtures. Do
  not run an MCP `apply` against this root: it rewrites the fixtures the tests depend on. Copy them
  to a temp folder first.

## App icon

`apps/desktop/icon/build.sh [out-dir]` renders `apps/desktop/icon/icon.svg` to
`<out-dir>/icon-1024.png` and `<out-dir>/preview.png` (16–512px on light and dark, plus 16px and
32px zooms; default out-dir `/tmp/driver-icon`), then regenerates `apps/desktop/src-tauri/icons`
with `bun tauri icon`. `SKIP_TAURI=1` renders the previews only. Needs `rsvg-convert` and
ImageMagick (`brew install librsvg imagemagick`). Look at `preview.png` after any change to the SVG.

## User acceptance

Give the user these steps (adapted to the change) as the final check. On a temp copy of the
fixtures, so the real `~/.driver` is untouched:

```sh
bun install
root=$(mktemp -d) && cp -R packages/core/fixtures/* "$root"
DRIVER_ROOT=$root bun --cwd apps/desktop tauri dev
```

1. Press `2`. The `pdk-2-sentry` page shows `33%`, `9 of 27 tasks done · 1 skipped`, two "needs you"
   rows and one blocked row.
2. Press `j` then `↵`: the reader opens on `t4-authorization-platform`. Press `r`: the raw file,
   exactly as on disk. Press `r` again for the rendered view.
3. Point a coordinator's `driver` MCP server at the same root (`DRIVER_ROOT=$root`) and ask it to
   mark `t4-agent-skills` done. The row turns sage and the headline goes to `37%` without a reload.
4. Press `y`, then `c`, pasting after each: the cursor row's absolute path, then
   `re <id> (<title>): <path>` for the same row. Each shows a toast.
5. Press `?`: the keys sheet. Every key on it works; `esc` closes it.
