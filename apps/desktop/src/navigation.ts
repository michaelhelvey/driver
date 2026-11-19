import type { Task } from "@driver/core";
import type { Accessor } from "solid-js";
import type { Clipboard } from "./clipboard.ts";
import { focusSoon, listRow } from "./focus.ts";
import type { Actions, ReaderActions } from "./keys.ts";
import type { Entry } from "./projects.ts";
import { phaseIdOf, type Row } from "./rows.ts";
import { toggleTheme } from "./theme.ts";
import type { Notify } from "./toasts.tsx";
import type { View } from "./view.ts";

type OkEntry = Extract<Entry, { kind: "ok" }>;

/** What the keys read and change. */
export type NavigationDeps = {
  root: Accessor<string>;
  view: View;
  clipboard: Accessor<Clipboard>;
  notify: Notify;
  /** Every project, in sidebar order. */
  entries: Accessor<Entry[]>;
  /** The project the page shows, whether it parses or not. */
  current: Accessor<Entry | undefined>;
  select: (slug: string) => void;
  /** The rows the cursor can be on now: filtered, without folded tasks. */
  visible: Accessor<Row[]>;
  cursor: Accessor<Row | undefined>;
  folded: (phaseId: string) => boolean;
};

/** {@link Actions} for the list, {@link ReaderActions} for the reader, and the palette's jumps. */
export type Navigation = Actions & {
  reader: ReaderActions;
  /** Opens a project and puts the cursor on one of its tasks, in the reader. */
  jumpTo: (slug: string, id: string) => void;
  /** Opens a project, with the filter cleared. */
  selectProject: (slug: string) => void;
  /** Focuses the cursor row of the list once it renders. */
  focusList: () => void;
};

const HALF_PAGE = 8;
const LINE_PX = 48;

const taskOf = (row: Row | undefined): Task | undefined =>
  row !== undefined && "task" in row ? row.task : undefined;

const phaseOf = (entries: Entry[], slug: string, id: string): string | undefined => {
  const entry = entries.find((e) => e.slug === slug);
  return entry?.kind === "ok" ? entry.project.tasks.find((t) => t.id === id)?.phase : undefined;
};

const scroll: ReaderActions["scroll"] = (by, sign) => {
  const pane = readerViewport();
  if (pane === null) return;
  const px = { line: LINE_PX, half: pane.clientHeight / 2, end: pane.scrollHeight }[by];
  pane.scrollBy({ top: px * sign });
};

const blockerOf = (task: Task | undefined): string | undefined =>
  task?.status.kind === "blocked" ? task.status.by : undefined;

const readerPane = () => document.querySelector<HTMLElement>(`[aria-label="Reader"]`);

const readerViewport = () =>
  readerPane()?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null;

const needsYouIn = (entries: Entry[]) =>
  entries.flatMap((entry) =>
    entry.kind === "ok" ? entry.project.needsYou.map((task) => ({ slug: entry.slug, task })) : [],
  );

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The app's key actions over its state. Every action that moves the cursor also focuses the
 * cursor row, so the list's own keys keep working from there.
 *
 * @example
 * const nav = createNavigation({ root: () => root, view, clipboard: () => clipboard, notify, entries, current, select, visible, cursor, folded });
 * bindKeymap(document, () => listKeys(nav));
 */
export function createNavigation(deps: NavigationDeps): Navigation {
  const { view, notify } = deps;
  const open = (): OkEntry | undefined => {
    const entry = deps.current();
    return entry?.kind === "ok" ? entry : undefined;
  };
  const slug = () => open()?.slug;
  const inOpen = (run: (slug: string) => void) => {
    const current = slug();
    if (current !== undefined) run(current);
  };
  const focusList = () => focusSoon(() => listRow(deps.cursor()?.key));
  const go = (key: string) => {
    inOpen((current) => view.setCursor(current, key));
    focusList();
  };
  const moveBy = (by: number) => {
    const rows = deps.visible();
    const at = rows.findIndex((row) => row.key === deps.cursor()?.key);
    const next = rows[Math.min(Math.max(at + by, 0), rows.length - 1)];
    if (next !== undefined) go(next.key);
  };
  const selectProject = (next: string) => {
    deps.select(next);
    view.clearFilter();
    focusList();
  };
  const step = (by: number) => {
    const entries = deps.entries();
    const at = entries.findIndex((entry) => entry.slug === deps.current()?.slug);
    const next = entries[(at + by + entries.length) % entries.length];
    if (next !== undefined) selectProject(next.slug);
  };
  const reveal = (target: string, id: string) => {
    selectProject(target);
    const phase = phaseOf(deps.entries(), target, id);
    if (phase !== undefined) view.setFold(target, phase, false);
    view.setCursor(target, `task:${id}`);
  };
  const openRow = (key: string) => {
    view.clearFilter();
    inOpen((current) => view.open(current, key));
    focusList();
  };
  const jumpTo = (target: string, id: string) => {
    reveal(target, id);
    view.open(target, `task:${id}`);
  };
  const nextNeedsYou = () => {
    const all = needsYouIn(deps.entries());
    const here = `${slug()}/${taskOf(deps.cursor())?.id}`;
    const at = all.findIndex((n) => `${n.slug}/${n.task.id}` === here);
    const next = all[(at + 1) % all.length];
    if (next === undefined) notify.info("nothing needs you anywhere ☼");
    else jumpTo(next.slug, next.task.id);
  };
  const firstNeedsYou = () => {
    const row = deps.visible().find((r) => r.kind === "attention");
    if (row === undefined) notify.info("nothing needs you here ☼");
    else go(row.key);
  };
  const blocker = () => {
    const by = blockerOf(taskOf(deps.cursor()));
    if (by === undefined) notify.info("no blocker on this one");
    else inOpen((current) => reveal(current, by));
  };
  const logFile = () => {
    if (open()?.project.log.length) openRow("log");
    else notify.info("no log.md in this project");
  };
  const fold = () => {
    const row = deps.cursor();
    const phaseId = row === undefined ? undefined : phaseIdOf(row);
    if (phaseId !== undefined)
      inOpen((current) => view.setFold(current, phaseId, !deps.folded(phaseId)));
  };
  const cursorKey = (run: (slug: string, key: string) => void) => {
    const key = deps.cursor()?.key;
    if (key !== undefined) inOpen((current) => run(current, key));
  };
  const focusReader = () => {
    if (!view.state.reader.open) cursorKey(view.open);
    focusSoon(readerPane);
  };
  const copy = (path: string) =>
    deps
      .clipboard()
      .writeText(path)
      .then(
        () => notify.info("copied", path),
        (error: unknown) => notify.error("could not copy the path:", errorText(error)),
      );
  const copyPath = () => {
    const entry = deps.current();
    if (entry !== undefined)
      void copy(`${deps.root()}/${entry.slug}/${deps.cursor()?.path ?? "project.md"}`);
  };
  const filter = () => {
    view.setEditing(true);
    focusSoon(() => document.querySelector<HTMLInputElement>("[data-testid=filter]"));
  };
  return {
    down: () => moveBy(1),
    up: () => moveBy(-1),
    top: () => moveBy(-Infinity),
    bottom: () => moveBy(Infinity),
    halfDown: () => moveBy(HALF_PAGE),
    halfUp: () => moveBy(-HALF_PAGE),
    firstNeedsYou,
    nextNeedsYou,
    fold,
    blocker,
    nextProject: () => step(1),
    prevProject: () => step(-1),
    project: (index) => {
      const entry = deps.entries()[index];
      if (entry !== undefined) selectProject(entry.slug);
    },
    palette: () => view.setOverlay("palette"),
    projectFile: () => openRow("project"),
    logFile,
    toggleReader: () => {
      cursorKey(view.activate);
      focusList();
    },
    focusReader,
    raw: () => view.toggleRaw(),
    copyPath,
    filter,
    sidebar: () => view.toggleSidebar(),
    theme: toggleTheme,
    help: () => view.setOverlay("help"),
    escape: () => {
      if (view.state.reader.open) view.closeReader();
      else view.clearFilter();
      focusList();
    },
    reader: { scroll, back: focusList },
    jumpTo,
    selectProject,
    focusList,
  };
}
