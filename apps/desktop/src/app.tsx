import { Resizable, ResizableHandle, ResizablePanel } from "@ui-sdk/solid/resizable";
import { createMemo, createSignal, Match, onSettled, Show, Switch } from "solid-js";
import { bindKeymap, type Keymap } from "./keymap.ts";
import { Pane } from "./pane.tsx";
import { ProjectPage, type PageProps } from "./project-page.tsx";
import type { Entry } from "./projects.ts";
import { cursorRow, isFinished, phaseIdOf, rowsOf, visibleRows } from "./rows.ts";
import { Sidebar } from "./sidebar.tsx";
import type { FileSource } from "./source/source.ts";
import { createProjects } from "./state.ts";
import { StatusLine } from "./status-line.tsx";
import { toggleTheme } from "./theme.ts";
import { createNow } from "./time.ts";
import { createView } from "./view.ts";

type OkEntry = Extract<Entry, { kind: "ok" }>;

/**
 * Shown in place of the page when the root cannot be read at all.
 *
 * @example
 * <Unreadable message="DRIVER_ROOT must be an absolute path, got ~/x" />
 */
export function Unreadable(props: { message: string }) {
  return (
    <p role="alert" class="px-13 pt-11.5 text-plum">
      {props.message}
    </p>
  );
}

function Empty(props: { root: string }) {
  return (
    <div data-testid="empty" class="mx-auto max-w-[880px] px-13 pt-11.5 text-muted">
      <p>
        No projects in <b class="font-normal text-ink-2">{props.root}</b>.
      </p>
      <p class="mt-3 text-faint">
        A project is a folder of markdown files there, written by an agent through the driver MCP
        server.
      </p>
      <p class="mt-3 text-faint">
        If {props.root} did not exist when driver started, restart driver after the first project is
        created: driver can only watch a folder that exists.
      </p>
    </div>
  );
}

const count = (entries: Entry[], kind: "needsYou" | "blocked") =>
  entries.reduce((sum, entry) => sum + (entry.kind === "ok" ? entry.project[kind].length : 0), 0);

const filesOf = (entries: Entry[]) =>
  entries.reduce((sum, entry) => sum + (entry.kind === "ok" ? entry.files.size : 0), 0);

/**
 * The whole app over one {@link FileSource}: the project sidebar, the open project's page, and
 * the status line.
 *
 * @example
 * render(() => <App source={fixtureSource()} />, document.body);
 */
export function App(props: { source: FileSource }) {
  const projects = createProjects(() => props.source);
  const view = createView();
  const now = createNow();
  const [selected, setSelected] = createSignal<string | null>(null, { name: "selected" });

  const current = createMemo(
    () => projects.list().find((entry) => entry.slug === selected()) ?? projects.list()[0],
    { name: "current" },
  );
  const open = createMemo((): OkEntry | undefined => {
    const entry = current();
    return entry?.kind === "ok" ? entry : undefined;
  });
  const rows = createMemo(() => {
    const entry = open();
    return entry === undefined ? [] : rowsOf(entry.project);
  });
  const folded = (phaseId: string) => {
    const entry = open();
    const phase = entry?.project.phases.find((p) => p.id === phaseId);
    const flipped = view.state.flipped[`${entry?.slug}/${phaseId}`] === true;
    return phase !== undefined && isFinished(phase) !== flipped;
  };
  const cursor = createMemo(() =>
    cursorRow(rows(), view.state.cursors[open()?.slug ?? ""] ?? null, folded),
  );
  const visible = createMemo(() => visibleRows(rows(), folded));

  const inOpen = (run: (slug: string) => void) => {
    const slug = open()?.slug;
    if (slug !== undefined) run(slug);
  };
  const onCursor = (key: string) => inOpen((slug) => view.setCursor(slug, key));
  const onActivate = (key: string) => inOpen((slug) => view.setCursor(slug, key));
  const onFold = (phaseId: string) => inOpen((slug) => view.flipFold(slug, phaseId));

  const page = createMemo((): PageProps | undefined => {
    const entry = open();
    return entry === undefined
      ? undefined
      : {
          slug: entry.slug,
          root: props.source.root,
          project: entry.project,
          fileCount: entry.files.size,
          rows: rows(),
          cursor: cursor()?.key,
          folded,
          now: now(),
          onCursor,
          onActivate,
          onFold,
        };
  });

  const selectAt = (index: number) => {
    const entry = projects.list()[index];
    if (entry !== undefined) setSelected(entry.slug);
  };
  const step = (by: number) => {
    const list = projects.list();
    const at = list.findIndex((entry) => entry.slug === current()?.slug);
    selectAt(Math.min(Math.max(at + by, 0), list.length - 1));
  };
  const foldAtCursor = () => {
    const row = cursor();
    const phaseId = row === undefined ? undefined : phaseIdOf(row);
    if (phaseId !== undefined) onFold(phaseId);
  };
  const keymap: Keymap = {
    J: () => step(1),
    K: () => step(-1),
    t: toggleTheme,
    " ": foldAtCursor,
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), () => selectAt(i)])),
  };
  onSettled(() => bindKeymap(document, keymap));

  return (
    <div class="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_26px]">
      <Resizable class="min-h-0">
        <ResizablePanel id="sidebar" defaultSize="252px" minSize="180px" maxSize="420px">
          <Sidebar
            entries={projects.list()}
            current={current()?.slug ?? null}
            root={props.source.root}
            files={filesOf(projects.list())}
            now={now()}
            onSelect={setSelected}
          />
        </ResizablePanel>
        <ResizableHandle
          aria-label="Resize projects"
          class="relative z-10 -ml-px w-px bg-rule outline-none focus-visible:bg-accent data-dragging:bg-accent"
        />
        <ResizablePanel id="main" minSize="360px" class="min-w-0">
          <main class="h-full">
            <Pane label="Project" class="h-full">
              <Switch fallback={<Empty root={props.source.root} />}>
                <Match when={projects.failure()}>
                  {(failure) => (
                    <Unreadable message={`Could not read ${props.source.root}: ${failure()}`} />
                  )}
                </Match>
                <Match when={!projects.ready()}>
                  <p class="px-13 pt-11.5 text-muted">Reading {props.source.root}…</p>
                </Match>
                <Match when={current()}>
                  {(entry) => <ProjectPage entry={entry()} page={page()} />}
                </Match>
              </Switch>
            </Pane>
          </main>
        </ResizablePanel>
      </Resizable>
      <Show when={open()} fallback={<footer class="border-t border-rule bg-bg-sunk" />}>
        {(entry) => (
          <StatusLine
            root={props.source.root}
            path={`${entry().slug}/${cursor()?.path ?? "project.md"}`}
            needsYou={count(projects.list(), "needsYou")}
            blocked={count(projects.list(), "blocked")}
            at={visible().findIndex((row) => row.key === cursor()?.key) + 1}
            of={visible().length}
            now={now()}
          />
        )}
      </Show>
    </div>
  );
}
