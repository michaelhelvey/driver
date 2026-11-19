# driver: build plan

driver is a read-only desktop view of agent-run projects. Each project is a folder of markdown files
under `~/.driver/`. A coordinator agent writes the files through a local MCP server. The desktop app
only reads them and shows what needs the user, what is blocked, and how far the project is.

The visual design and the keymap are set by the mockup:
[`mockups/driver.html`](../mockups/driver.html). Open it in a browser and press `?`. The mockup is
the reference for layout, colors, type, and keys. Its JavaScript is a throwaway; do not port it.

## Goals

- One page per project: the summary, a headline progress number, what needs the user, what is
  blocked, recent log entries, and the phases with their tasks.
- Everything is a file. No database. A person can read every file with `cat`.
- Free text first, metadata second. Agents explain things in markdown, not in fields.
- Keyboard for everything. No action needs the mouse.
- The UI is read-only. The only writer is the MCP server's `apply` tool.

## Non-goals

- Tracking whether an agent is running. The user has a terminal harness (Rex) for that. There is no
  `agent` field, no heartbeat, and no liveness check.
- Editing from the UI. The user talks to the coordinator in the terminal.
- Sync, accounts, or anything that is not on the local disk.

## File layout

```
~/.driver/
  <project-slug>/
    project.md                 # summary + decisions, written by the coordinator
    log.md                     # append-only log of what happened
    <NN>-<phase-slug>/         # e.g. 00-pdk-2.0, 03a-framework-apps
      phase.md                 # what the phase is, phase-wide verification
      <NN>-<task-slug>.md      # e.g. 01-t4-coa.md
```

- **Order** comes from the `NN-` prefix. Phase prefixes can have a letter (`03a`, `03b`).
- **Ids** are the slug: the file or folder name without the prefix (`t4-coa`, `framework-apps`). Ids
  are unique within a project. All references (`blocked_by`, tool arguments) use ids.
- **Position labels** like `03a.1` are made from the prefixes and are display only. They change when
  tasks move, so nothing stores them.
- `apply` owns the prefixes. It renames files when items are added or moved.

### `project.md`

```md
---
title: pdk-2-sentry
repo: ~/dev/t4/t4-platform-lambda
rex: 01JD7Q3V8MZ4-... # optional, see "Rex keys"
started: 2026-11-10
updated: 2026-11-19T07:38:00Z
---

Summary paragraphs. The text before the first `##` is shown at the top of the project page.

## decisions

- ...
```

### `log.md`

```md
---
title: log
---

## 2026-11-17T20:51:00Z

Phase 00 complete: #46 merged as 3a24ff6, deploy_beta 44154822350 green.

## 2026-11-19T07:38:00Z

t4-transit-times is on alpha. Waiting for the forced crash to land in Sentry.
```

Oldest first, so a write is a true append. The UI shows it newest first. (The mockup's sample
`log.md` files are newest first; ignore that.)

### `phase.md`

```md
---
title: canaries
---

Free text. The first line is the one-line note under the phase header.
```

### Task files

```md
---
title: t4-authorization-platform
status: needs-you
ask: "authorizer cold start +290ms — keep 500ms reserve, or drop to 200ms?"
repo: t4-authorization-platform
pr: "#204"
updated: 2026-11-19T07:02:00Z
---

Free text: notes, options, verification steps. `- [ ]` / `- [x]` lines are the task's steps; the UI
shows their count as `4/9`.
```

| field        | when                    | meaning                                               |
| ------------ | ----------------------- | ----------------------------------------------------- |
| `title`      | always                  | shown in rows                                         |
| `status`     | always                  | `todo` `doing` `needs-you` `blocked` `done` `skipped` |
| `ask`        | only with `needs-you`   | one line: what the agent needs from the user          |
| `blocked_on` | only with `blocked`     | one line: what the task waits for                     |
| `blocked_by` | optional with `blocked` | id of the blocking task                               |
| `why`        | only with `skipped`     | one line: why it was skipped                          |
| `repo`, `pr` | optional                | shown in rows and the reader                          |
| `updated`    | always, set by `apply`  | ISO 8601 UTC                                          |

### Derived values (never stored)

- Project percent: `done / (all − skipped)`.
- "Now in": the first phase that has a task that is not `done` or `skipped`.
- Step counts: from the checkboxes in the body.
- "Needs you" and "blocked": a filter on `status`.
- Project `updated`: the newest `updated` of its files.

## MCP tools

Six tools: four read, two write. The descriptions below are what the agent sees. Keep them in the
code as the zod schemas' `.describe()` text, so the agent's docs and the validation have one source.

### Read

**`list_projects()`**

> List every project under `~/.driver`. Returns each project's slug, title, percent complete, count
> of tasks that need the user, count of blocked tasks, and when it was last updated. Use this to
> find a project's slug, or to answer "what's going on across my projects".

**`get_project(slug)`**

> Get a project's current state in one call: the summary from `project.md`, every phase in order
> with its one-line note, every task with its id, position label (`03a.1`), status, `ask` or
> `blocked_on`, step progress (`2/5`), repo, and PR, plus the 10 newest log entries. Call this
> before `apply` so your changes are based on the current state. Task bodies are not included; use
> `read` for those.

**`read(slug, refs)`**

> Read the raw markdown of one or more files in a project, exactly as they are on disk, frontmatter
> included. `refs` is a list of task or phase ids, or `"project"` or `"log"`. Use this when you need
> a task's full notes, verification steps, or checklist.

**`needs_me()`**

> List every task across all projects that is `needs-you` or `blocked`, with its project, id, title,
> and the `ask` or `blocked_on` line. This is exactly what the user sees at the top of each project
> page. Use it when the user asks what's waiting on them.

### Write

**`create_project({ slug, title, repo, summary, rex? })`**

> Create a new project directory with `project.md` and an empty `log.md`. `summary` is the free-text
> paragraph shown at the top of the project page: what this project is and where it stands. `rex` is
> optional: your `$REX_SESSION`, so the user can jump to you from the UI. Fails if the slug already
> exists.

**`apply(slug, { log, ops })`**

> The only way to change a project. Send every change in one call. The batch is checked as a whole
> and either all of it is written or none of it is. If anything is invalid, nothing is written and
> you get the validation error back.
>
> `log` is required: one or two sentences saying what happened and the evidence for it ("t4-coa
> merged as #52; beta deploy 4415 is green"). It is added to `log.md`. Describe what happened, not
> what you plan to do.
>
> Each op creates the item if the id is new, or updates it if it already exists. Fields you leave
> out stay unchanged. There is no delete: mark work that's no longer needed as `skipped` and give a
> reason.
>
> - `{ op: "project", summary?, body? }`: update the project summary, or the rest of `project.md`.
> - `{ op: "phase", id, title?, after?, body? }`: create, update, or reorder a phase. `after` is the
>   id of the phase it should come after.
> - `{ op: "task", id, phase?, after?, title?, repo?, pr?, status?, body? }`: create, update, move,
>   or reorder a task. Setting `phase` moves it to another phase.
>
> `status` is one of:
>
> - `{ kind: "todo" }`
> - `{ kind: "doing" }`
> - `{ kind: "done" }`
> - `{ kind: "needs-you", ask }`: one line saying exactly what you need from the user.
> - `{ kind: "blocked", on, by? }`: `on` is what it's waiting for; `by` is the id of a blocking
>   task.
> - `{ kind: "skipped", why }`
>
> `body` replaces the whole markdown body. Put notes, verification steps, and a checklist there.
> `- [ ]` / `- [x]` lines are counted as the task's steps.
>
> Files are renamed and renumbered, and `updated` is set, for you.

### `apply` rules the code must enforce

- `status` is a tagged union in the API. It is stored flat in frontmatter (`status` + `ask` /
  `blocked_on` / `blocked_by` / `why`). Changing status removes the fields of the old status.
- `blocked_by` and `after` must name an existing id (or one created in the same batch).
- A new task needs `phase` and `title`. A new phase needs `title`.
- The whole batch is checked against the result state before any file is written.
- Writes are all-or-nothing: write every new file to a temp name in the project directory, then
  rename all of them into place. Renames for renumbering happen in the same step.
- One `apply` at a time per project: take an exclusive lock file (`<project>/.lock`) for the whole
  call. A second caller waits, then fails with a clear error after a timeout.
- Frontmatter is written with a real YAML library, quoted where needed (`pr: "#204"`).

## Architecture

```
driver/                        # bun workspace
  packages/core/               # schemas + parse + plan. Pure TS, no fs, no Node APIs.
  packages/mcp/                # stdio MCP server (bun). The only writer.
  apps/desktop/                # Tauri v2 + Solid 2 + @ui-sdk/solid + Tailwind v4. Read-only.
  mockups/driver.html          # design reference
  docs/plan.md                 # this file
```

### `packages/core`

The deep module. Everything that knows the file format lives here, so the UI and the MCP server
cannot disagree.

- zod schemas for frontmatter, ops, and tool inputs/outputs. Types come from `z.infer`.
- `parseProject(files: ReadonlyMap<string, string>): Project`: paths relative to the project
  directory, to the project model (phases, tasks, ids, labels, derived values, log entries).
- `planApply(current: Project, input: ApplyInput): Plan | ApplyError`: checks the batch and returns
  the file writes and renames. It does not touch the disk.
- `render(project)` helpers the tools return (`get_project` shape, `needs_me` shape).
- Markdown body stays a string. The core never parses markdown except to count checkboxes and split
  `log.md` entries.

### `packages/mcp`

- Built on the official MCP TypeScript SDK, stdio transport, run with `bun`.
- Root directory from `DRIVER_ROOT`, default `~/.driver`.
- A small fs adapter (read tree, lock, write temp, rename) passed in to the tool handlers. Tests
  pass a temp directory; no module mocks.
- Log every tool call to stderr as one JSON line (tool, project, op count, ms, error).
- Register it in the coordinator's harness config (OpenCode / Claude Code `mcp` entry).

### `apps/desktop`

- Tauri v2. The Rust side stays tiny: `tauri-plugin-fs` scoped read-only to `$HOME/.driver/**` with
  the `watch` feature, `tauri-plugin-clipboard-manager` for `y`. No custom Rust commands unless
  something can't be done from the plugins.
- Frontend: Vite + Solid 2 (`solid-js` and `@solidjs/web` 2.x) + `@ui-sdk/solid` + Tailwind v4
  (`@tailwindcss/vite`).
- Data flow: a `FileSource` interface (`readTree()`, `watch(onChange)`) with two implementations:
  Tauri fs (real app) and an in-memory fixture (dev in a browser, tests). Files go through
  `parseProject` from `packages/core`. On a change, re-read only the changed project (debounce
  100ms).
- Markdown rendering: `marked` with custom renderers to match the mockup (faint `##` before
  headings, `[x]` / `[ ]` task boxes, `$ ` prompt on `sh` blocks, comment lines muted, `# →` result
  lines in sage). Escape everything; files are agent-written text.

#### Components from ui-sdk

| UI piece                 | ui-sdk                                  |
| ------------------------ | --------------------------------------- |
| command palette (`⌘K`)   | `@ui-sdk/solid/command` in a `dialog`   |
| keys help (`?`)          | `@ui-sdk/solid/dialog`                  |
| toasts (`y`, errors)     | `@ui-sdk/solid/toast`                   |
| sidebar / reader split   | `@ui-sdk/solid/resizable`               |
| scroll panes             | `@ui-sdk/solid/scroll-area`             |
| progress bar             | `@ui-sdk/solid/progress`                |
| phase fold               | `@ui-sdk/solid/collapsible`             |
| task list cursor (`j/k`) | core focus / list behaviors (see below) |

The main list (project header, attention rows, log block, phase headers, task rows) is one keyboard
list with a single cursor. Build it as a custom primitive from ui-sdk's list and focus behaviors
(`@ui-sdk/core`, "Lists" and "Focus and Keys"), so ARIA and focus come for free. The global keymap
(`J`/`K`, `1`–`9`, `g g`, `/`, `t`, ...) is a small app-level handler; it must not fire while focus
is in a text input.

#### Styling

- Tokens from the mockup's CSS variables (`--bg`, `--ink`, `--accent`, `--amber`, `--plum`,
  `--sage`, ...) as a Tailwind v4 `@theme`, with `paper` and `cocoa` themes switched by `data-theme`
  on `<html>`.
- Font: `"Berkeley Mono"` is installed locally on the user's machine. Reference it by name; do not
  bundle it.
- Style ui-sdk parts by `data-slot` and state attributes with Tailwind variants
  (`data-highlighted:bg-focus`). Put `@layer ui-sdk;` above `@import "tailwindcss";`.
- Keep the mockup's paper grain overlay and `<meta name="darkreader-lock">`.

### Rex keys (last milestone, optional)

`c` and `o` shell out to `rex` when the project has a `rex:` session id. They are one command per
key press; nothing polls Rex.

- `c`: `rex send -s <rex> 're <id> (<title>): '` then select that session, so the user lands in the
  coordinator's prompt with a reference to the item under the cursor.
- `o`: `rex split -s <rex> --split=right --ratio 40 -- nvim -R <path>`.

Needs `tauri-plugin-shell` with an allowlist for the `rex` binary only. If the user decides against
Rex integration, drop this milestone and the `rex` field.

## Milestones

Each milestone ends with `bun run validate` green and the listed check passing.

1. **Workspace + core.** Convert the repo to a bun workspace. `packages/core` with schemas,
   `parseProject`, `planApply`. Fixtures: the mockup's `pdk-2-sentry` and `driver` projects as real
   files under `packages/core/fixtures/`. _Check:_ table tests (`it.each`) parse the fixtures and
   assert ids, labels, percent, "now in", step counts; `planApply` cases for create, update, move,
   reorder, status change, bad `blocked_by`, missing `ask`.
2. **MCP server.** `packages/mcp` with the six tools. _Check:_ an e2e test starts the server over
   stdio with the MCP client SDK against a temp copy of the fixtures, calls every tool, and asserts
   the files on disk and a re-parse. A test runs two `apply` calls at once and asserts both land and
   the log has both entries.
3. **Desktop shell.** Tauri v2 app that lists projects from `~/.driver` and live-reloads on file
   change. Fixture `FileSource` for browser dev. _Check:_ `bun tauri dev` opens the window; editing
   a fixture file updates the page within a second.
4. **Project page to parity with the mockup.** Sidebar, header, headline, needs you, blocked,
   recent, phases, reader pane with rendered and raw views, both themes. _Check:_ side-by-side
   screenshots against `mockups/driver.html` with the same fixture data.
5. **Keyboard.** Every key in the mockup's `?` sheet. Palette, filter, help, toasts. _Check:_
   Playwright against the browser build with the fixture source drives the full key flow (move, open
   reader, focus reader, raw, filter, palette jump across projects, fold, `b`, `g n`) with no mouse;
   `@solidjs/diagnostics` `expectNoDiagnostics` on the main flows.
6. **Rex keys (optional).** See above.

## Verification for the user

After milestone 5:

```sh
bun install
cp -R packages/core/fixtures/* ~/.driver/          # or point DRIVER_ROOT at the fixtures
bun --cwd apps/desktop tauri dev
```

1. The `pdk-2-sentry` page shows `33%`, `9 of 27 tasks done · 1 skipped`, two "needs you" rows, one
   blocked row.
2. Press `j` then `↵`: the reader opens on `t4-authorization-platform`. Press `r`: the raw file.
3. In a terminal, ask a coordinator with the MCP server to mark `t4-agent-skills` done. The row
   turns sage and the headline goes to `37%` without a reload.

## Open decisions

- `broken` as a separate status (agent's own failure, shown in the attention area) or just `doing`
  with the error in the body. Current plan: no `broken`.
- Rex keys: keep (milestone 6) or drop.
- Whether the MCP server also exposes a `driver` skill/prompt for coordinators, or the tool
  descriptions are enough. Current plan: tool descriptions only.
