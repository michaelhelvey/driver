import type { Project, Task } from "@driver/core";
import { For, Match, Show, Switch } from "solid-js";
import { CursorList, CursorListRow } from "./list/parts.ts";
import type { Entry } from "./projects.ts";
import { STATUS } from "./status.ts";

function TaskRow(props: { task: Task }) {
  return (
    <CursorListRow
      value={props.task.id}
      class="group grid grid-cols-[1.5ch_2ch_5.5ch_minmax(0,1fr)_5ch] items-baseline gap-x-2 rounded-md py-1.25 pr-3.5 pl-2 outline-none data-cursor:bg-focus"
    >
      <span class="text-accent opacity-0 group-data-cursor:opacity-100">›</span>
      <span class={["text-center", STATUS[props.task.status.kind].color]}>
        {STATUS[props.task.status.kind].glyph}
      </span>
      <span class="text-[11.5px] text-faint group-data-cursor:text-muted">{props.task.label}</span>
      <span
        class={[
          "truncate",
          {
            "text-muted": props.task.status.kind === "done",
            "text-faint line-through": props.task.status.kind === "skipped",
          },
        ]}
      >
        {props.task.title}
      </span>
      <span class="text-right text-[11.5px] text-faint">
        <Show when={props.task.steps.total > 0}>
          {props.task.steps.done}/{props.task.steps.total}
        </Show>
      </span>
    </CursorListRow>
  );
}

function Overview(props: { slug: string; root: string; project: Project }) {
  return (
    <>
      <div class="text-[11.5px] text-muted">
        {props.root} / <b class="font-normal text-ink-2">{props.slug}</b>
      </div>
      <h1 class="mt-1 mb-3.5 text-[28px] leading-tight font-bold tracking-[-.03em]">
        {props.project.meta.title}
      </h1>
      <p class="max-w-[70ch] text-[13.5px] whitespace-pre-line text-ink-2">
        {props.project.summary}
      </p>
      <div class="mt-7.5 flex items-baseline gap-4">
        <span
          data-testid="headline-percent"
          class="text-[34px] leading-none font-bold tracking-[-.04em]"
        >
          {props.project.progress.percent}
          <small class="ml-0.5 text-lg font-normal text-muted">%</small>
        </span>
        <span class="whitespace-nowrap text-ink-2">
          <b class="text-ink">{props.project.progress.done}</b> of {props.project.progress.total}{" "}
          tasks done <span class="text-muted">· {props.project.progress.skipped} skipped</span>
        </span>
      </div>
      <div class="mt-3.5 h-[3px] overflow-hidden rounded-[3px] bg-rule">
        <i
          class="block h-full rounded-[3px] bg-sage"
          style={{ width: `${props.project.progress.percent}%` }}
        />
      </div>
      <CursorList aria-label="Tasks" class="mt-9">
        <For each={props.project.tasks} keyed={(task) => task.id}>
          {(task) => <TaskRow task={task()} />}
        </For>
      </CursorList>
    </>
  );
}

/**
 * One project's page: its title, headline percent and tasks, or, when its files do not parse,
 * the error that names the file.
 *
 * @example
 * <ProjectPage entry={entry} root={source.root} />
 */
export function ProjectPage(props: { entry: Entry; root: string }) {
  return (
    <article class="mx-auto max-w-[880px] px-13 pt-11.5 pb-35">
      <Switch>
        <Match when={props.entry.kind === "ok" ? props.entry.project : undefined}>
          {(project) => <Overview slug={props.entry.slug} root={props.root} project={project()} />}
        </Match>
        <Match when={props.entry.kind === "error" ? props.entry.message : undefined}>
          {(message) => (
            <div role="alert">
              <h1 class="mb-3.5 text-[28px] leading-tight font-bold tracking-[-.03em]">
                {props.entry.slug}
              </h1>
              <p class="text-plum">This project's files do not parse.</p>
              <pre class="mt-3 rounded-lg border border-rule bg-code-bg px-4 py-3 text-[12.25px] whitespace-pre-wrap">
                {message()}
              </pre>
            </div>
          )}
        </Match>
      </Switch>
    </article>
  );
}
