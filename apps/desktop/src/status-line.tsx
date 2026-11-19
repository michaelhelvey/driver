import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { STATUS } from "./status.ts";

/** What the keys do now: the mode the status line shows. */
export type Mode = "NORMAL" | "READER" | "FILTER" | "PALETTE" | "KEYS";

const MODE_COLOR: Readonly<Record<Mode, string>> = {
  NORMAL: "bg-ink",
  READER: "bg-accent",
  FILTER: "bg-amber",
  PALETTE: "bg-sage",
  KEYS: "bg-sage",
};

function Segment(props: { children: JSX.Element }) {
  return <span class="flex items-center gap-1.5 border-l border-rule px-3">{props.children}</span>;
}

/**
 * The status line at the bottom of the window: the mode, the path of the cursor row's file (and
 * the kept filter), the counts across every project, where the cursor is in the list, and the
 * time.
 *
 * @example
 * <StatusLine mode="NORMAL" root="~/.driver" path="pdk-2-sentry/log.md" filter="" needsYou={3} blocked={2} at={4} of={30} now={now()} />
 */
export function StatusLine(props: {
  mode: Mode;
  root: string;
  /** The cursor row's file, relative to the root. */
  path: string;
  /** The kept filter query, shown after the path while it is not being edited. */
  filter: string;
  needsYou: number;
  blocked: number;
  at: number;
  of: number;
  now: number;
}) {
  const parts = () => props.path.split("/");
  return (
    <footer class="flex items-stretch overflow-hidden border-t border-rule bg-bg-sunk text-[11px] whitespace-nowrap text-muted">
      <span
        data-testid="mode"
        class={[
          "flex min-w-[9ch] items-center justify-center px-3 font-bold tracking-[.1em] text-bg",
          MODE_COLOR[props.mode],
        ]}
      >
        {props.mode}
      </span>
      <span class="block min-w-0 flex-1 truncate px-3 leading-[25px]">
        {props.root}/{parts().slice(0, -1).join("/")}/
        <b class="font-normal text-ink-2">{parts().at(-1)}</b>
        <Show when={props.filter !== "" && props.mode !== "FILTER"}>
          <span class="text-amber"> /{props.filter}</span>
        </Show>
      </span>
      <Segment>
        <span class={STATUS["needs-you"].color}>{STATUS["needs-you"].glyph}</span>
        {props.needsYou} need you
      </Segment>
      <Segment>
        <span class={STATUS.blocked.color}>{STATUS.blocked.glyph}</span>
        {props.blocked} blocked
      </Segment>
      <Segment>
        {props.at}/{props.of}
      </Segment>
      <Segment>read-only</Segment>
      <Segment>{new Date(props.now).toTimeString().slice(0, 5)}</Segment>
    </footer>
  );
}
