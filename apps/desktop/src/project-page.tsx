import type { Phase, Project, Status, Task } from "@driver/core";
import type { JSX } from "@solidjs/web";
import { Collapsible, CollapsiblePanel } from "@ui-sdk/solid/collapsible";
import { Progress, ProgressIndicator, ProgressTrack } from "@ui-sdk/solid/progress";
import { For, Match, Show, Switch } from "solid-js";
import { Html } from "./html.tsx";
import { CursorList, CursorListRow } from "./list/parts.ts";
import { renderInline, renderMarkdown } from "./markdown.ts";
import type { Entry } from "./projects.ts";
import { isFinished, type Row, type RowOf } from "./rows.ts";
import { STATUS } from "./status.ts";
import { ago } from "./time.ts";

/** What a project page shows and how it reports what the user does on it. */
export type PageProps = {
  slug: string;
  root: string;
  project: Project;
  fileCount: number;
  rows: Row[];
  /** The key of the cursor row. */
  cursor: string | undefined;
  folded: (phaseId: string) => boolean;
  now: number;
  onCursor: (key: string) => void;
  onActivate: (key: string) => void;
  onFold: (phaseId: string) => void;
  /** The task filter. `rows` already holds only what it leaves. */
  query: string;
};

const ROW = "group outline-none";
const CARET = "text-accent opacity-0 group-data-cursor:opacity-100";
const FAINT_TO_MUTED = "text-[11.5px] text-faint group-data-cursor:text-muted";

function Caret() {
  return <span class={CARET}>▸</span>;
}

function Glyph(props: { task: Task }) {
  return (
    <span class={["text-center", STATUS[props.task.status.kind].color]}>
      {STATUS[props.task.status.kind].glyph}
    </span>
  );
}

function Label(props: { children: JSX.Element; count?: JSX.Element; aside?: JSX.Element }) {
  return (
    <div class="mt-[38px] mb-2.5 flex items-center gap-2.5 text-[10.5px] tracking-[.12em] text-muted after:order-1 after:h-px after:flex-1 after:bg-rule after:content-['']">
      {props.children}
      <Show when={props.count}>{(count) => <span class="tracking-normal">{count()}</span>}</Show>
      <Show when={props.aside}>
        {(aside) => <span class="order-2 tracking-normal text-faint">{aside()}</span>}
      </Show>
    </div>
  );
}

function Header(props: PageProps) {
  return (
    <CursorListRow
      value="project"
      data-kind="project"
      class={[ROW, "-mx-4 rounded-[10px] px-4 pt-2.5 pb-3.5 data-cursor:bg-focus"]}
    >
      <div class="text-[11.5px] text-muted">
        {props.root}/<b class="font-normal text-ink-2">{props.slug}</b>/project.md
      </div>
      <h1 class="mt-1 mb-3.5 text-[28px] leading-[1.2] font-bold tracking-[-.03em]">
        {props.project.meta.title}
      </h1>
      <Html
        as="div"
        class="max-w-[70ch] text-[13.5px] text-ink-2 [&_p]:mt-0 [&_p]:mb-[.75em]"
        html={renderMarkdown(props.project.summary)}
      />
      <div class="mt-1 text-[11.5px] text-muted">
        updated {ago(props.project.updated, props.now)} ago · {props.project.meta.repo}
      </div>
    </CursorListRow>
  );
}

function Headline(props: PageProps) {
  const nowIn = () => props.project.phases.find((phase) => phase.id === props.project.nowIn);
  return (
    <>
      <div class="mt-7.5 flex items-baseline gap-4">
        <span
          data-testid="headline-percent"
          class="text-[34px] leading-none font-bold tracking-[-.04em]"
        >
          {props.project.progress.percent}
          <small class="ml-0.5 text-[18px] font-normal text-muted">%</small>
        </span>
        <span class="whitespace-nowrap text-ink-2">
          <b class="text-ink">{props.project.progress.done}</b> of{" "}
          <b class="text-ink">{props.project.progress.total}</b> tasks done
          <Show when={props.project.progress.skipped > 0}>
            {" "}
            <span class="text-muted">· {props.project.progress.skipped} skipped</span>
          </Show>
        </span>
        <span class="ml-auto min-w-0 truncate text-[11.5px] whitespace-nowrap text-muted">
          <Show when={nowIn()} fallback="all phases done">
            {(phase) => (
              <>
                now in{" "}
                <b class="font-normal text-ink-2">
                  {phase().label} · {phase().title}
                </b>
              </>
            )}
          </Show>
        </span>
      </div>
      <Progress value={props.project.progress.percent} aria-label="Tasks done" class="mt-3.5">
        <ProgressTrack class="h-[3px] overflow-hidden rounded-[3px] bg-rule">
          <ProgressIndicator class="h-full rounded-[3px] bg-sage" />
        </ProgressTrack>
      </Progress>
    </>
  );
}

const whyOf = (status: Status): string => {
  if (status.kind === "needs-you") return status.ask;
  return status.kind === "blocked" ? status.on : "";
};

const blockerOf = (status: Status): string | undefined =>
  status.kind === "blocked" ? status.by : undefined;

function AttentionRow(props: { row: RowOf<"attention">; page: PageProps }) {
  const phase = () => props.page.project.phases.find((p) => p.id === props.row.task.phase);
  const blocker = () => {
    const id = blockerOf(props.row.task.status);
    return props.page.project.tasks.find((task) => task.id === id);
  };
  return (
    <CursorListRow
      value={props.row.key}
      data-kind="attention"
      class={[
        ROW,
        "grid grid-cols-[1.5ch_2ch_minmax(0,1fr)_auto_4ch] items-baseline gap-x-2 rounded-md pt-[7px] pr-3.5 pb-2 pl-2",
      ]}
    >
      <Caret />
      <Glyph task={props.row.task} />
      <div class="min-w-0">
        <div class="truncate">
          <span data-label class="mr-[1ch] text-[11.5px] text-muted">
            {props.row.task.label}
          </span>
          {props.row.task.title}
        </div>
        <div class="inline-ink mt-px truncate text-[12px] text-ink-2">
          <span class={STATUS[props.row.task.status.kind].color}>→</span>{" "}
          <Html as="span" html={renderInline(whyOf(props.row.task.status))} />
          <Show when={blocker()}>
            {(by) => <span class="text-muted"> · waits on {by().label}</span>}
          </Show>
        </div>
      </div>
      <span class="text-[11px] whitespace-nowrap text-muted">
        {phase()?.label} · {phase()?.title}
      </span>
      <span class={["text-right", FAINT_TO_MUTED]}>
        {ago(props.row.task.updated, props.page.now)}
      </span>
    </CursorListRow>
  );
}

function Attention(props: { page: PageProps; kind: "needs-you" | "blocked" }) {
  const rows = () =>
    props.page.rows.filter(
      (row): row is RowOf<"attention"> =>
        row.kind === "attention" && row.task.status.kind === props.kind,
    );
  return (
    <Show when={rows().length > 0}>
      <Label
        count={
          <span class={STATUS[props.kind].color}>
            {STATUS[props.kind].glyph} {rows().length}
          </span>
        }
      >
        {props.kind === "needs-you" ? "needs you" : "blocked"}
      </Label>
      <div
        class={[
          "-mx-1 rounded-[10px] border p-1",
          props.kind === "needs-you"
            ? "border-[color-mix(in_oklab,var(--amber)_18%,transparent)] bg-[color-mix(in_oklab,var(--amber-wash)_55%,transparent)] [&_[data-cursor]]:bg-[color-mix(in_oklab,var(--focus)_85%,var(--amber-wash))]"
            : "border-transparent [&_[data-cursor]]:bg-focus",
        ]}
      >
        <For each={rows()} keyed={(row) => row.key}>
          {(row) => <AttentionRow row={row()} page={props.page} />}
        </For>
      </div>
    </Show>
  );
}

function Calm(props: { page: PageProps }) {
  return (
    <Show
      when={props.page.query === "" && !props.page.rows.some((row) => row.kind === "attention")}
    >
      <Label>needs you</Label>
      <div class="px-2 py-1.5 text-muted">
        <span class="text-amber">☼</span> nothing needs you here.
      </div>
    </Show>
  );
}

function Recent(props: { page: PageProps }) {
  const entries = () => props.page.project.log.toReversed().slice(0, 3);
  return (
    <Show when={props.page.rows.some((row) => row.kind === "log")}>
      <Label aside={`log.md · ${props.page.project.log.length} entries`}>recent</Label>
      <CursorListRow
        value="log"
        data-kind="log"
        class={[ROW, "-mx-4 rounded-[10px] px-4 pt-1.5 pb-2 data-cursor:bg-focus"]}
      >
        <For each={entries()} keyed={false}>
          {(entry, i) => (
            <div class="grid grid-cols-[4ch_minmax(0,1fr)] gap-3.5 py-0.5 text-[12.5px]">
              <span class={["text-right", i === 0 ? "text-muted" : "text-faint"]}>
                {ago(entry().at, props.page.now)}
              </span>
              <Html
                as="span"
                class={["inline-plain truncate", i === 0 ? "text-ink-2" : "text-muted"]}
                html={renderInline(entry().text.split("\n").join(" "))}
              />
            </div>
          )}
        </For>
      </CursorListRow>
    </Show>
  );
}

/**
 * The cells of a task row, shared by the page and the reader's "tasks in this phase".
 *
 * @example
 * <div class="grid …"><TaskCells task={task} now={now()} /></div>
 */
export function TaskCells(props: { task: Task; now: number }) {
  return (
    <>
      <Caret />
      <Glyph task={props.task} />
      <span data-label class={FAINT_TO_MUTED}>
        {props.task.label}
      </span>
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
      <span class="text-[11.5px] text-muted">{props.task.pr}</span>
      <span class={["text-right", FAINT_TO_MUTED]}>
        <Show when={props.task.steps.total > 0}>
          {props.task.steps.done}/{props.task.steps.total}
        </Show>
      </span>
      <span class={["text-right", FAINT_TO_MUTED]}>{ago(props.task.updated, props.now)}</span>
    </>
  );
}

/** The grid of a task row. */
export const TASK_GRID =
  "grid grid-cols-[1.5ch_2ch_5.5ch_minmax(0,1fr)_auto_5ch_4ch] items-baseline gap-x-2 py-[5px] pr-3.5";

function TaskRow(props: { row: RowOf<"task">; now: number }) {
  return (
    <CursorListRow
      value={props.row.key}
      data-kind="task"
      class={[ROW, TASK_GRID, "rounded-r-md pl-2 data-cursor:bg-focus"]}
    >
      <TaskCells task={props.row.task} now={props.now} />
    </CursorListRow>
  );
}

const onFoldClick = (fold: () => void) => (el: HTMLElement) =>
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    fold();
  });

function PhaseRow(props: { row: RowOf<"phase">; folded: boolean; onFold: () => void }) {
  const finished = () => isFinished(props.row.phase);
  return (
    <CursorListRow
      value={props.row.key}
      data-kind="phase"
      class={[
        ROW,
        "grid grid-cols-[1.5ch_2ch_auto_minmax(0,1fr)_150px_6ch] items-center gap-x-2 rounded-md py-1.5 pr-3.5 pl-2 data-cursor:bg-focus",
      ]}
    >
      <Caret />
      <span class="cursor-pointer text-center text-faint" ref={onFoldClick(() => props.onFold())}>
        {props.folded ? "▸" : "▾"}
      </span>
      <span data-label class={["font-bold", finished() ? "text-muted" : "text-accent"]}>
        {props.row.phase.label}
      </span>
      <span class={["truncate font-bold", { "text-muted": finished() }]}>
        {props.row.phase.title}
      </span>
      <span class="flex h-[5px] gap-0.5">
        <For each={props.row.phase.tasks} keyed={(task) => task.id}>
          {(task) => <i class={["flex-1 rounded-[1px]", STATUS[task().status.kind].bar]} />}
        </For>
      </span>
      <span class="text-right text-[11.5px] text-muted">
        <Show when={finished()}>
          <span class="text-sage">✓</span>{" "}
        </Show>
        {props.row.phase.progress.done}/{props.row.phase.progress.total}
      </span>
    </CursorListRow>
  );
}

function PhaseBlock(props: { phase: Phase; page: PageProps }) {
  const header = () =>
    props.page.rows.find(
      (row): row is RowOf<"phase"> => row.kind === "phase" && row.phase.id === props.phase.id,
    );
  const tasks = () =>
    props.page.rows.filter(
      (row): row is RowOf<"task"> => row.kind === "task" && row.task.phase === props.phase.id,
    );
  const folded = () => props.page.folded(props.phase.id);
  return (
    <Show when={header()}>
      {(row) => (
        <Collapsible open={!folded()} class="mt-[18px]">
          <PhaseRow
            row={row()}
            folded={folded()}
            onFold={() => props.page.onFold(props.phase.id)}
          />
          <Html
            as="div"
            class="inline-ink mb-1 ml-[calc(8px+1.5ch+8px+2ch+8px)] truncate pr-3.5 text-[12px] text-muted"
            html={renderInline(props.phase.note)}
          />
          <CollapsiblePanel class="ml-[calc(8px+1.5ch+8px+1ch)] border-l border-rule">
            <For each={tasks()} keyed={(task) => task.key}>
              {(task) => <TaskRow row={task()} now={props.page.now} />}
            </For>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Show>
  );
}

function NoMatch(props: { page: PageProps }) {
  return (
    <Show when={!props.page.rows.some((row) => row.kind === "phase")}>
      <div class="px-2 py-1.5 text-muted">
        no tasks match <b class="text-ink-2">/{props.page.query}</b>
      </div>
    </Show>
  );
}

function Overview(props: PageProps) {
  return (
    <CursorList
      aria-label="Project"
      cursor={props.cursor ?? null}
      onCursorChange={(key) => props.onCursor(key)}
      onActivate={(key) => props.onActivate(key)}
    >
      <Header {...props} />
      <Headline {...props} />
      <Attention page={props} kind="needs-you" />
      <Attention page={props} kind="blocked" />
      <Calm page={props} />
      <Recent page={props} />
      <Label>phases</Label>
      <For each={props.project.phases} keyed={(phase) => phase.id}>
        {(phase) => <PhaseBlock phase={phase()} page={props} />}
      </For>
      <NoMatch page={props} />
      <div class="mt-14 text-center text-[11.5px] text-faint">
        ~ eof · {props.fileCount} files under {props.root}/{props.slug} ~
      </div>
    </CursorList>
  );
}

/**
 * One project's page, top to bottom: header, headline, what needs the user, what is
 * blocked, the recent log, and the phases with their tasks, all rows of one cursor list. When the
 * project's files do not parse, the page shows the error that names the file.
 *
 * @example
 * <ProjectPage entry={entry} page={page()} />
 */
export function ProjectPage(props: { entry: Entry; page: PageProps | undefined }) {
  return (
    <article class="mx-auto max-w-[880px] px-13 pt-11.5 pb-35">
      <Switch>
        <Match when={props.page}>{(page) => <Overview {...page()} />}</Match>
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
