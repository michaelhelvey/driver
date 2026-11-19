import {
  createResizableController,
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable";
import { createEffect, createMemo, createSignal, Match, onSettled, Show, Switch } from "solid-js";
import type { Clipboard } from "./clipboard.ts";
import { FilterBar } from "./filter-bar.tsx";
import { listRow } from "./focus.ts";
import { Help } from "./help.tsx";
import { bindKeymap } from "./keymap.ts";
import { listKeys, readerKeys } from "./keys.ts";
import { createNavigation } from "./navigation.ts";
import { Palette, type PaletteCommand } from "./palette.tsx";
import { Pane } from "./pane.tsx";
import { ProjectPage, type PageProps } from "./project-page.tsx";
import type { Entry } from "./projects.ts";
import { Reader, type ReaderProps } from "./reader.tsx";
import {
  cursorRow,
  filterRows,
  isFinished,
  matches,
  rowsOf,
  visibleRows,
  type Row,
} from "./rows.ts";
import { Sidebar } from "./sidebar.tsx";
import type { FileSource } from "./source/source.ts";
import { createProjects } from "./state.ts";
import { StatusLine, type Mode } from "./status-line.tsx";
import { createNow } from "./time.ts";
import { createToasts, Toasts } from "./toasts.tsx";
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

function Which() {
  return (
    <div
      data-testid="which"
      class="fixed bottom-10 left-1/2 z-60 flex -translate-x-1/2 animate-appear gap-3.5 rounded-lg border border-rule bg-panel px-3.5 py-2 text-[11.5px] text-ink-2 shadow-card"
    >
      <span>
        <kbd>g</kbd> then
      </span>
      <span>
        <kbd>g</kbd> top
      </span>
      <span>
        <kbd>p</kbd> project.md
      </span>
      <span>
        <kbd>n</kbd> next that needs you
      </span>
    </div>
  );
}

const readerWidth = (): `${number}px` => `${Math.round(Math.min(window.innerWidth * 0.46, 700))}px`;

const count = (entries: Entry[], kind: "needsYou" | "blocked") =>
  entries.reduce((sum, entry) => sum + (entry.kind === "ok" ? entry.project[kind].length : 0), 0);

const filesOf = (entries: Entry[]) =>
  entries.reduce((sum, entry) => sum + (entry.kind === "ok" ? entry.files.size : 0), 0);

const isFolded = (entry: OkEntry, folds: Readonly<Record<string, boolean>>, phaseId: string) => {
  const phase = entry.project.phases.find((p) => p.id === phaseId);
  return phase !== undefined && (folds[`${entry.slug}/${phaseId}`] ?? isFinished(phase));
};

const matchCount = (entry: OkEntry | undefined, query: string) =>
  entry?.project.tasks.filter((task) => matches(task, query)).length ?? 0;

const inReader = (target: EventTarget | null) =>
  target instanceof Element && target.closest(`[aria-label="Reader"]`) !== null;

const MODES: readonly [
  Mode,
  (state: { overlay: string; filtering: boolean; reader: boolean }) => boolean,
][] = [
  ["PALETTE", (s) => s.overlay === "palette"],
  ["KEYS", (s) => s.overlay === "help"],
  ["FILTER", (s) => s.filtering],
  ["READER", (s) => s.reader],
];

/**
 * The whole app over one {@link FileSource}: the project sidebar, the open project's page, the
 * reader beside it, the status line, and the keys, palette, keys sheet and toasts over them.
 * `y` copies paths to `clipboard`.
 *
 * @example
 * render(() => <App source={fixtureSource()} clipboard={browserClipboard()} />, document.body);
 */
export function App(props: { source: FileSource; clipboard: Clipboard }) {
  const projects = createProjects(() => props.source);
  const view = createView(() => cursor()?.key);
  const now = createNow();
  const split = createResizableController();
  const toasts = createToasts();
  const [selected, setSelected] = createSignal<string | null>(null, { name: "selected" });
  const [inReaderPane, setInReaderPane] = createSignal(false, { name: "in-reader" });
  const [pending, setPending] = createSignal<string | null>(null, { name: "pending-key" });

  const current = createMemo(
    () => projects.list().find((entry) => entry.slug === selected()) ?? projects.list()[0],
    { name: "current" },
  );
  const open = createMemo((): OkEntry | undefined => {
    const entry = current();
    return entry?.kind === "ok" ? entry : undefined;
  });
  const query = () => view.state.filter.query;
  const rows = createMemo(
    () => {
      const entry = open();
      return entry === undefined ? [] : filterRows(rowsOf(entry.project), query());
    },
    { name: "rows" },
  );
  const folded = (phaseId: string) => {
    const entry = open();
    return query() === "" && entry !== undefined && isFolded(entry, view.state.folds, phaseId);
  };
  const cursor = createMemo(() =>
    cursorRow(rows(), view.state.cursors[open()?.slug ?? ""] ?? null, folded),
  );
  const visible = createMemo(() => visibleRows(rows(), folded));

  const nav = createNavigation({
    root: () => props.source.root,
    view,
    clipboard: () => props.clipboard,
    notify: toasts.notify,
    entries: projects.list,
    open,
    select: setSelected,
    visible,
    cursor,
    folded,
  });

  const inOpen = (run: (slug: string) => void) => {
    const slug = open()?.slug;
    if (slug !== undefined) run(slug);
  };

  const onCursor = (key: string) => inOpen((slug) => view.setCursor(slug, key));
  const onActivate = (key: string) => inOpen((slug) => view.activate(slug, key));
  const onFold = (phaseId: string) => {
    const fold = !folded(phaseId);
    inOpen((slug) => view.setFold(slug, phaseId, fold));
  };

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
          query: query(),
          onCursor,
          onActivate,
          onFold,
        };
  });

  const readerOf = (entry: OkEntry | undefined, row: Row | undefined): ReaderProps | undefined =>
    entry === undefined || row === undefined
      ? undefined
      : {
          slug: entry.slug,
          root: props.source.root,
          project: entry.project,
          row,
          text: entry.files.get(row.path) ?? "",
          raw: view.state.reader.raw,
          now: now(),
          focused: inReaderPane(),
        };
  const reader = createMemo(() =>
    view.state.reader.open ? readerOf(open(), cursor()) : undefined,
  );
  const shown = createMemo(() => reader() !== undefined, { name: "shown" });
  createEffect(shown, (isShown) => {
    if (isShown) split.resize("reader", readerWidth());
    else split.collapse("reader");
  });
  createEffect(
    () => view.state.sidebar,
    (sidebar) => {
      if (sidebar) split.expand("sidebar");
      else split.collapse("sidebar");
    },
  );
  createEffect(projects.ready, (ready) => {
    if (ready) nav.focusList();
  });

  const mode = (): Mode => {
    const state = {
      overlay: view.state.overlay,
      filtering: view.state.filter.editing,
      reader: inReaderPane() && shown(),
    };
    return MODES.find(([, active]) => active(state))?.[0] ?? "NORMAL";
  };

  const commands: readonly PaletteCommand[] = [
    { label: "toggle theme", key: "t", run: nav.theme },
    { label: "toggle sidebar", key: "[", run: nav.sidebar },
    { label: "open project.md", key: "p", run: nav.projectFile },
    { label: "open log.md", key: "L", run: nav.logFile },
    { label: "filter tasks", key: "/", run: nav.filter },
    { label: "copy path", key: "y", run: nav.copyPath },
    { label: "show all keys", key: "?", run: nav.help },
  ];

  const track = (event: FocusEvent) => setInReaderPane(inReader(event.target));
  onSettled(() => {
    document.addEventListener("focusin", track);
    const unbind = bindKeymap(
      document,
      () => {
        if (view.state.overlay !== "none") return {};
        return inReaderPane() && shown() ? readerKeys(nav, nav.reader) : listKeys(nav);
      },
      setPending,
    );
    return () => {
      document.removeEventListener("focusin", track);
      unbind();
    };
  });

  const cursorElement = () => listRow(cursor()?.key);
  const closeOverlay = () => view.setOverlay("none");

  return (
    <div class="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_26px]">
      <Resizable
        controller={split}
        class="min-h-0"
        onLayoutCommit={() => {
          if (split.isCollapsed("reader")) view.closeReader();
        }}
      >
        <ResizablePanel
          id="sidebar"
          collapsible
          collapsedSize={0}
          defaultSize="252px"
          minSize="252px"
          maxSize="420px"
        >
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
          <main class="flex h-full flex-col">
            <FilterBar
              query={query()}
              editing={view.state.filter.editing}
              shown={matchCount(open(), query())}
              total={matchCount(open(), "")}
              onQuery={view.setQuery}
              onEditing={view.setEditing}
              onDone={(keep) => {
                if (!keep) view.clearFilter();
                nav.focusList();
              }}
            />
            <Pane label="Project" class="min-h-0 flex-1">
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
        <ResizableHandle
          aria-label="Resize reader"
          class="relative z-10 -mr-px w-px bg-rule outline-none focus-visible:bg-accent data-dragging:bg-accent has-[+[data-collapsed]]:hidden"
        />
        <ResizablePanel
          id="reader"
          collapsible
          collapsedSize={0}
          defaultSize={0}
          minSize="320px"
          class="min-w-0"
        >
          <Show when={reader()}>{(shownReader) => <Reader {...shownReader()} />}</Show>
        </ResizablePanel>
      </Resizable>
      <Show when={open()} fallback={<footer class="border-t border-rule bg-bg-sunk" />}>
        {(entry) => (
          <StatusLine
            mode={mode()}
            root={props.source.root}
            path={`${entry().slug}/${cursor()?.path ?? "project.md"}`}
            filter={query()}
            needsYou={count(projects.list(), "needsYou")}
            blocked={count(projects.list(), "blocked")}
            at={visible().findIndex((row) => row.key === cursor()?.key) + 1}
            of={visible().length}
            now={now()}
          />
        )}
      </Show>
      <Show when={pending() === "g"}>
        <Which />
      </Show>
      <Help
        open={view.state.overlay === "help"}
        onClose={closeOverlay}
        finalFocus={cursorElement}
      />
      <Palette
        open={view.state.overlay === "palette"}
        onClose={closeOverlay}
        finalFocus={cursorElement}
        entries={projects.list()}
        now={now()}
        commands={commands}
        onRun={(run) => {
          nav.focusList();
          run();
        }}
        onTask={nav.jumpTo}
        onProject={nav.selectProject}
      />
      <Toasts toaster={toasts.toaster} />
    </div>
  );
}
