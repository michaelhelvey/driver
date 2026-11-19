import { For, Match, Switch } from "solid-js";
import { CursorList, CursorListRow } from "./list/parts.ts";
import type { Entry } from "./projects.ts";
import { STATUS } from "./status.ts";

function ProjectRow(props: { entry: Entry; index: number }) {
  return (
    <CursorListRow
      value={props.entry.slug}
      class="group relative cursor-pointer px-5 pt-2 pb-2.5 outline-none hover:bg-bg/50 data-cursor:bg-bg"
    >
      <span class="absolute inset-y-2 left-0 hidden w-[3px] rounded-r bg-accent group-data-cursor:block" />
      <div class="flex items-baseline gap-2.5">
        <span class="w-[1ch] text-[11px] text-faint group-data-cursor:text-accent">
          {props.index < 9 ? props.index + 1 : ""}
        </span>
        <span class="truncate group-data-cursor:font-bold">{props.entry.slug}</span>
        <Switch>
          <Match when={props.entry.kind === "ok" ? props.entry.project : undefined}>
            {(project) => (
              <span class="ml-auto text-[11px] text-faint group-data-cursor:text-muted">
                {project().progress.percent}%
              </span>
            )}
          </Match>
          <Match when={props.entry.kind === "error"}>
            <span class="ml-auto text-[11px] text-plum">error</span>
          </Match>
        </Switch>
      </div>
      <Switch>
        <Match when={props.entry.kind === "ok" ? props.entry.project : undefined}>
          {(project) => (
            <div class="ml-[calc(1ch+10px)] flex gap-2 text-[11px] text-muted">
              <span class="truncate">{project().meta.title}</span>
              <span class="ml-auto flex gap-2">
                <span class={STATUS["needs-you"].color} hidden={project().needsYou.length === 0}>
                  {STATUS["needs-you"].glyph} {project().needsYou.length}
                </span>
                <span class={STATUS.blocked.color} hidden={project().blocked.length === 0}>
                  {STATUS.blocked.glyph} {project().blocked.length}
                </span>
              </span>
            </div>
          )}
        </Match>
      </Switch>
    </CursorListRow>
  );
}

/**
 * The project list: one row per project with its percent and how many tasks need the user. The
 * cursor is the open project.
 *
 * @example
 * <Sidebar entries={projects.list()} current={slug()} root={source.root} onSelect={setSlug} />
 */
export function Sidebar(props: {
  entries: Entry[];
  current: string | null;
  root: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <aside class="flex min-w-0 flex-col overflow-hidden border-r border-rule bg-bg-sunk whitespace-nowrap">
      <div class="flex items-center gap-2.5 px-5 pt-5 pb-4.5 text-sm font-bold tracking-[-.01em]">
        <span class="text-[15px] text-accent">▲</span>driver
      </div>
      <div class="flex items-center gap-2 px-5 py-1.5 text-[10.5px] tracking-[.12em] text-muted after:h-px after:flex-1 after:bg-rule">
        PROJECTS
      </div>
      <CursorList
        aria-label="Projects"
        cursor={props.current}
        onCursorChange={(slug) => props.onSelect(slug)}
      >
        <For each={props.entries} keyed={(entry) => entry.slug}>
          {(entry, index) => <ProjectRow entry={entry()} index={index()} />}
        </For>
      </CursorList>
      <div class="mt-auto truncate border-t border-rule px-5 pt-4 pb-4.5 text-[11px] text-faint">
        {props.root}
      </div>
    </aside>
  );
}
