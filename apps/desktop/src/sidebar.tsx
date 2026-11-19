import { For, Match, Show, Switch } from "solid-js";
import { CursorList, CursorListRow } from "./list/parts.ts";
import type { Entry } from "./projects.ts";
import { STATUS } from "./status.ts";
import { ago } from "./time.ts";

function Badge(props: { kind: "needs-you" | "blocked"; count: number }) {
  return (
    <Show when={props.count > 0}>
      <span class={STATUS[props.kind].color}>
        {STATUS[props.kind].glyph} {props.count}
      </span>
    </Show>
  );
}

function ProjectRow(props: { entry: Entry; index: number; now: number }) {
  return (
    <CursorListRow
      value={props.entry.slug}
      class="group relative cursor-pointer px-5 pt-[9px] pb-2.5 outline-none hover:bg-[color-mix(in_oklab,var(--bg)_50%,transparent)] data-cursor:bg-bg"
    >
      <span class="absolute inset-y-2 left-0 hidden w-[3px] rounded-r-[3px] bg-accent group-data-cursor:block" />
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
      <Show when={props.entry.kind === "ok" ? props.entry.project : undefined}>
        {(project) => (
          <div class="ml-[calc(1ch+10px)] flex gap-2.5 text-[11px] text-muted">
            <span class="truncate">updated {ago(project().updated, props.now)} ago</span>
            <span class="ml-auto flex gap-2">
              <Badge kind="needs-you" count={project().needsYou.length} />
              <Badge kind="blocked" count={project().blocked.length} />
            </span>
          </div>
        )}
      </Show>
    </CursorListRow>
  );
}

function Hint(props: { keys: string; children: string }) {
  return (
    <>
      <span>
        <kbd>{props.keys}</kbd>
      </span>
      <span>{props.children}</span>
    </>
  );
}

/**
 * The project list: one row per project with its percent, when it changed, and how many tasks
 * need the user or are blocked. The cursor is the open project.
 *
 * @example
 * <Sidebar entries={projects.list()} current={slug()} root={source.root} files={12} now={now()} onSelect={setSlug} />
 */
export function Sidebar(props: {
  entries: Entry[];
  current: string | null;
  root: string;
  files: number;
  now: number;
  onSelect: (slug: string) => void;
}) {
  return (
    <aside class="flex h-full min-w-0 flex-col overflow-hidden bg-bg-sunk whitespace-nowrap">
      <div class="flex items-center gap-2.5 px-5 pt-5 pb-4.5 text-[14px] font-bold tracking-[-.01em]">
        <span class="text-[15px] text-accent">▚</span>driver
      </div>
      <div class="flex items-center gap-2 px-5 py-1.5 text-[10.5px] tracking-[.12em] text-muted after:h-px after:flex-1 after:bg-rule after:content-['']">
        projects
      </div>
      <CursorList
        aria-label="Projects"
        cursor={props.current}
        onCursorChange={(slug) => props.onSelect(slug)}
      >
        <For each={props.entries} keyed={(entry) => entry.slug}>
          {(entry, index) => <ProjectRow entry={entry()} index={index()} now={props.now} />}
        </For>
      </CursorList>
      <div class="mt-auto grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-[7px] border-t border-rule px-5 pt-4 pb-4.5 text-[11px] text-muted">
        <span class="col-span-full mb-1 truncate text-faint">
          {props.root} · {props.files} files
        </span>
        <Hint keys="↵">open in the reader</Hint>
        <Hint keys="r">raw file</Hint>
        <Hint keys="t">paper / cocoa</Hint>
      </div>
    </aside>
  );
}
