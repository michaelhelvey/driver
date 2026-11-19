import type { Task } from "@driver/core";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemText,
  CommandList,
  createCommandController,
  type CommandData,
  type CommandDataGroup,
} from "@ui-sdk/solid/command";
import { createEffect, createMemo, For } from "solid-js";
import { chordOf } from "./keymap.ts";
import { Overlay } from "./overlay.tsx";
import type { Entry } from "./projects.ts";
import { STATUS } from "./status.ts";
import { ago } from "./time.ts";

/** A command the palette lists under "commands", with the key that does the same. */
export type PaletteCommand = { label: string; key: string; run: () => void };

/** What the palette jumps to, and how. */
export type PaletteProps = {
  open: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
  entries: Entry[];
  now: number;
  commands: readonly PaletteCommand[];
  /** Runs a choice once the palette has closed. */
  onRun: (run: () => void) => void;
  onTask: (slug: string, id: string) => void;
  onProject: (slug: string) => void;
};

type Item = {
  value: string;
  label: string;
  sub: string;
  glyph: string;
  color: string;
  run: () => void;
};

const okProjects = (entries: Entry[]) =>
  entries.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));

const tasksWhere = (
  entries: Entry[],
  keep: (task: Task) => boolean,
  onTask: PaletteProps["onTask"],
): Item[] =>
  okProjects(entries).flatMap((entry) =>
    entry.project.tasks.filter(keep).map((task) => ({
      value: `task:${entry.slug}/${task.id}`,
      label: task.title,
      sub: `${entry.slug} · ${task.id}`,
      glyph: STATUS[task.status.kind].glyph,
      color: STATUS[task.status.kind].color,
      run: () => onTask(entry.slug, task.id),
    })),
  );

const summary = (entry: Entry, now: number) =>
  entry.kind === "ok"
    ? `${entry.project.progress.percent}% · updated ${ago(entry.project.updated, now)} ago`
    : "does not parse";

const projectItems = (
  entries: Entry[],
  now: number,
  onProject: PaletteProps["onProject"],
): Item[] =>
  entries.map((entry, i) => ({
    value: `project:${entry.slug}`,
    label: entry.slug,
    sub: summary(entry, now),
    glyph: i < 9 ? String(i + 1) : "",
    color: "text-muted",
    run: () => onProject(entry.slug),
  }));

const commandItems = (commands: readonly PaletteCommand[]): Item[] =>
  commands.map((command) => ({
    value: `command:${command.label}`,
    label: command.label,
    sub: command.key,
    glyph: "›",
    color: "text-muted",
    run: command.run,
  }));

const needsYou = (task: Task) => task.status.kind === "needs-you";

const CLOSES = new Set(["Escape", "mod+k"]);

function PaletteItem(props: { item: Item }) {
  return (
    <CommandItem
      value={props.item.value}
      label={props.item.label}
      keywords={[props.item.sub]}
      class="grid scroll-m-2 grid-cols-[2ch_minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-[7px] px-3 py-[7px] data-highlighted:bg-focus"
    >
      <span class={["text-center", props.item.color]}>{props.item.glyph}</span>
      <CommandItemText class="truncate [&_mark]:bg-transparent [&_mark]:font-bold [&_mark]:text-accent" />
      <span class="text-[11.5px] whitespace-nowrap text-muted">{props.item.sub}</span>
    </CommandItem>
  );
}

const isGroup = (entry: CommandData[number]): entry is CommandDataGroup =>
  typeof entry !== "string" && "type" in entry && entry.type === "group";

const valueOf = (entry: CommandData[number]) =>
  typeof entry === "string" ? entry : "value" in entry ? entry.value : "";

function Group(props: { group: CommandDataGroup; items: ReadonlyMap<string, Item> }) {
  const shown = () => props.group.items.flatMap((entry) => props.items.get(valueOf(entry)) ?? []);
  return (
    <CommandGroup>
      <CommandGroupLabel class="px-3 pt-2.5 pb-1 text-[10.5px] tracking-[.12em] text-muted">
        {props.group.label}
      </CommandGroupLabel>
      <For each={shown()} keyed={(item) => item.value}>
        {(item) => <PaletteItem item={item()} />}
      </For>
    </CommandGroup>
  );
}

const group = (label: string, items: readonly Item[]): CommandDataGroup => ({
  type: "group",
  label,
  items: items.map((item) => ({ value: item.value, label: item.label, keywords: [item.sub] })),
});

function Search(props: PaletteProps) {
  const controller = createCommandController();
  createEffect(
    () => props.open,
    (open) => {
      if (open) controller.setQuery("");
    },
  );
  const groups = createMemo(() => ({
    needs: tasksWhere(props.entries, needsYou, props.onTask),
    projects: projectItems(props.entries, props.now, props.onProject),
    tasks: tasksWhere(props.entries, (task) => !needsYou(task), props.onTask),
    commands: commandItems(props.commands),
  }));
  const items = createMemo(
    () =>
      new Map(Object.values(groups()).flatMap((list) => list.map((item) => [item.value, item]))),
  );
  const data = createMemo(() => {
    const { needs, projects, tasks, commands } = groups();
    return {
      all: [
        group("needs you", needs),
        group("projects", projects),
        group("tasks", tasks),
        group("commands", commands),
      ],
      empty: [group("needs you", needs), group("projects", projects), group("commands", commands)],
    };
  });
  return (
    <Command
      controller={controller}
      items={data().all}
      emptyItems={data().empty}
      onAction={(value) => {
        const run = items().get(value)?.run;
        props.onClose();
        if (run !== undefined) props.onRun(run);
      }}
    >
      <div class="flex items-center gap-3 border-b border-rule px-[18px] py-[15px]">
        <span class="font-bold text-accent">›</span>
        <CommandInput
          aria-label="Jump to a project, task, or command"
          placeholder="jump to a project, task, or command"
          spellcheck="false"
          autocomplete="off"
          onKeyDown={(event) => {
            if (CLOSES.has(chordOf(event))) props.onClose();
          }}
          class="flex-1 bg-transparent text-[14px] text-ink caret-accent outline-none placeholder:text-faint"
        />
      </div>
      <CommandEmpty class="p-[22px] text-center text-muted data-empty:block">
        nothing matches. it's not in a file anywhere.
      </CommandEmpty>
      <CommandList class="max-h-[54vh] overflow-y-auto p-1.5">
        {(state) => (
          <For each={state.items.filter(isGroup)} keyed={(entry) => entry.label}>
            {(entry) => <Group group={entry()} items={items()} />}
          </For>
        )}
      </CommandList>
      <div class="flex gap-3.5 border-t border-rule px-4 py-[9px] text-[11px] text-muted">
        <span class="flex items-center gap-1.5">
          <kbd>↑</kbd>
          <kbd>↓</kbd> move
        </span>
        <span class="flex items-center gap-1.5">
          <kbd>↵</kbd> go
        </span>
        <span class="flex items-center gap-1.5">
          <kbd>esc</kbd> close
        </span>
        <span class="ml-auto">everything is a file · read-only</span>
      </div>
    </Command>
  );
}

/**
 * The command palette (`⌘K`): what needs the user in every project, the projects, every task
 * once something is typed, and the commands, searched fuzzily. Escape or `⌘K` again closes it, as
 * in the mockup. Choosing one closes the palette, then jumps or runs it. Each open starts with an
 * empty search, even when it reopens while the last one is still closing.
 *
 * @example
 * <Palette open={open()} entries={projects.list()} … onTask={jumpTo} onProject={select} />
 */
export function Palette(props: PaletteProps) {
  return (
    <Overlay
      title="palette"
      open={props.open}
      onClose={() => props.onClose()}
      finalFocus={() => props.finalFocus()}
      class="top-[13vh] w-[min(660px,92vw)]"
    >
      <Search {...props} />
    </Overlay>
  );
}
