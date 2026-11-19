import { createMemo, createSignal, Match, onSettled, Switch } from "solid-js";
import { bindKeymap, type Keymap } from "./keymap.ts";
import { ProjectPage } from "./project-page.tsx";
import { Sidebar } from "./sidebar.tsx";
import type { FileSource } from "./source/source.ts";
import { createProjects } from "./state.ts";

const toggleTheme = () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "cocoa" ? "paper" : "cocoa";
};

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

/**
 * The whole app over one {@link FileSource}: the project sidebar and the open project's page.
 *
 * @example
 * render(() => <App source={fixtureSource()} />, document.body);
 */
export function App(props: { source: FileSource }) {
  const projects = createProjects(() => props.source);
  const [selected, setSelected] = createSignal<string | null>(null, { name: "selected" });
  const current = createMemo(
    () => projects.list().find((entry) => entry.slug === selected()) ?? projects.list()[0],
    { name: "current" },
  );

  const selectAt = (index: number) => {
    const entry = projects.list()[index];
    if (entry !== undefined) setSelected(entry.slug);
  };
  const step = (by: number) => {
    const list = projects.list();
    const at = list.findIndex((entry) => entry.slug === current()?.slug);
    selectAt(Math.min(Math.max(at + by, 0), list.length - 1));
  };
  const keymap: Keymap = {
    J: () => step(1),
    K: () => step(-1),
    t: toggleTheme,
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), () => selectAt(i)])),
  };
  onSettled(() => bindKeymap(document, keymap));

  return (
    <div class="grid h-screen grid-cols-[252px_minmax(0,1fr)]">
      <Sidebar
        entries={projects.list()}
        current={current()?.slug ?? null}
        root={props.source.root}
        onSelect={setSelected}
      />
      <main class="min-w-0 overflow-y-auto">
        <Switch
          fallback={
            <div class="mx-auto max-w-[880px] px-13 pt-11.5 text-muted">
              <p>
                No projects in <b class="font-normal text-ink-2">{props.source.root}</b>.
              </p>
              <p class="text-faint">
                A project is a folder of markdown files there, written by an agent through the
                driver MCP server.
              </p>
            </div>
          }
        >
          <Match when={projects.failure()}>
            {(failure) => (
              <Unreadable message={`Could not read ${props.source.root}: ${failure()}`} />
            )}
          </Match>
          <Match when={!projects.ready()}>
            <p class="px-13 pt-11.5 text-muted">Reading {props.source.root}…</p>
          </Match>
          <Match when={current()}>
            {(entry) => <ProjectPage entry={entry()} root={props.source.root} />}
          </Match>
        </Switch>
      </main>
    </div>
  );
}
