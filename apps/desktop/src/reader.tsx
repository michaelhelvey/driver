import { readFrontmatter, type Project, type Status } from "@driver/core";
import type { JSX } from "@solidjs/web";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Html } from "./html.tsx";
import { renderMarkdown, renderRaw } from "./markdown.ts";
import { Pane } from "./pane.tsx";
import { TASK_GRID, TaskCells } from "./project-page.tsx";
import type { Row } from "./rows.ts";
import { STATUS } from "./status.ts";
import { ago } from "./time.ts";

/** What the reader shows: one row's file of one project. */
export type ReaderProps = {
  slug: string;
  root: string;
  project: Project;
  row: Row;
  /** The file's text, exactly as it is on disk. */
  text: string;
  raw: boolean;
  now: number;
  /** Whether focus is in the reader, so its keys scroll it. */
  focused: boolean;
};

const isStatus = (value: string): value is Status["kind"] => Object.hasOwn(STATUS, value);

const VALUES: Readonly<Record<string, (value: string, now: number) => JSX.Element>> = {
  status: (value) =>
    isStatus(value) ? (
      <span>
        <span class={STATUS[value].color}>{STATUS[value].glyph}</span> {value}
      </span>
    ) : (
      value
    ),
  updated: (value, now) => (
    <>
      {value} <span class="text-faint">· {ago(value, now)} ago</span>
    </>
  ),
  pr: (value) => <span class="text-accent">{value}</span>,
  blocked_by: (value) => (
    <>
      <span class="text-accent">{value}</span>
      <span class="ml-2 text-muted">
        <kbd>b</kbd> jump
      </span>
    </>
  ),
};

const plain = (value: string) => value;

function Frontmatter(props: { data: Record<string, unknown>; now: number }) {
  const fields = () => Object.entries(props.data).filter(([key]) => key !== "title");
  return (
    <div class="mb-4.5 text-[12px] text-muted">
      <div class="tracking-[.1em] text-faint">---</div>
      <For each={fields()} keyed={([key]) => key}>
        {(field) => (
          <div class="grid grid-cols-[12ch_minmax(0,1fr)]">
            <span>{field()[0]}</span>
            <span class="text-ink-2">
              {(VALUES[field()[0]] ?? plain)(String(field()[1]), props.now)}
            </span>
          </div>
        )}
      </For>
      <div class="tracking-[.1em] text-faint">---</div>
    </div>
  );
}

const Sep = () => <span class="mx-1.5 text-faint">›</span>;

function Context(props: ReaderProps) {
  const task = () =>
    props.row.kind === "task" || props.row.kind === "attention" ? props.row.task : undefined;
  const phase = () => {
    const id = props.row.kind === "phase" ? props.row.phase.id : task()?.phase;
    return props.project.phases.find((p) => p.id === id);
  };
  return (
    <div class="text-[11.5px] text-muted">
      <span>{props.slug}</span>
      <Show when={phase()}>
        {(p) => (
          <>
            <Sep />
            <span>
              {p().label} {p().title}
            </span>
          </>
        )}
      </Show>
      <Show when={task()}>
        {(t) => (
          <>
            <Sep />
            <span>{t().label}</span>
          </>
        )}
      </Show>
    </div>
  );
}

function PhaseTasks(props: ReaderProps) {
  return (
    <Show when={props.row.kind === "phase" ? props.row.phase : undefined}>
      {(phase) => (
        <>
          <div class="mt-[38px] mb-2.5 flex items-center gap-2.5 text-[10.5px] tracking-[.12em] text-muted after:h-px after:flex-1 after:bg-rule after:content-['']">
            tasks in this phase
          </div>
          <For each={phase().tasks} keyed={(task) => task.id}>
            {(task) => (
              <div class={TASK_GRID}>
                <TaskCells task={task()} now={props.now} />
              </div>
            )}
          </For>
        </>
      )}
    </Show>
  );
}

function Rendered(props: ReaderProps) {
  const doc = createMemo(() => readFrontmatter(props.row.path, props.text));
  const title = () => {
    const value = doc().data["title"];
    return typeof value === "string" ? value : props.row.path;
  };
  return (
    <>
      <Frontmatter data={doc().data} now={props.now} />
      <Context {...props} />
      <h2 class="mt-0.5 mb-4.5 text-[20px] leading-[1.3] font-bold tracking-[-.02em]">{title()}</h2>
      <Html as="article" class="md" html={renderMarkdown(doc().body)} />
      <PhaseTasks {...props} />
    </>
  );
}

/**
 * The reader pane: the cursor row's file, rendered like the mockup or raw, exactly as on disk.
 *
 * @example
 * <Reader slug="pdk-2-sentry" root={root} project={project} row={row} text={text} raw={false} now={now()} />
 */
export function Reader(props: ReaderProps) {
  const dir = () => props.row.path.split("/").slice(0, -1).join("/");
  const name = () => props.row.path.split("/").at(-1);
  return (
    <section
      aria-label="Reader"
      tabindex="-1"
      data-focused={props.focused ? "" : undefined}
      class="relative flex h-full min-w-0 flex-col overflow-hidden border-l border-rule bg-panel outline-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:origin-left before:scale-x-0 before:bg-accent before:transition-transform before:content-[''] data-focused:before:scale-x-100"
    >
      <div class="flex items-center gap-4 border-b border-rule px-6.5 py-3 text-[11.5px] whitespace-nowrap text-muted">
        <span data-testid="reader-path" class="min-w-0 flex-1 truncate">
          {props.root}/{props.slug}/{dir() === "" ? "" : `${dir()}/`}
          <b class="font-normal text-ink">{name()}</b>
        </span>
        <span class="flex items-center gap-1.5 text-[11px]">
          <kbd>r</kbd> {props.raw ? "rendered" : "raw"} <kbd>↵</kbd> close
        </span>
      </div>
      <Pane label="File" class="min-h-0 flex-1" content="min-w-0 px-7.5 pt-5.5 pb-30">
        <Switch>
          <Match when={props.raw}>
            <Html as="pre" data-testid="reader-raw" class="raw" html={renderRaw(props.text)} />
          </Match>
          <Match when={!props.raw}>
            <Rendered {...props} />
          </Match>
        </Switch>
      </Pane>
    </section>
  );
}
