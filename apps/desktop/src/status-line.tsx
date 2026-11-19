import type { JSX } from "@solidjs/web";
import { STATUS } from "./status.ts";

function Segment(props: { children: JSX.Element }) {
  return <span class="flex items-center gap-1.5 border-l border-rule px-3">{props.children}</span>;
}

/**
 * The status line at the bottom of the window: the mode, the path of the cursor row's file, the
 * counts across every project, where the cursor is in the list, and the time.
 *
 * @example
 * <StatusLine root="~/.driver" path="pdk-2-sentry/log.md" needsYou={3} blocked={2} at={4} of={30} now={now()} />
 */
export function StatusLine(props: {
  root: string;
  /** The cursor row's file, relative to the root. */
  path: string;
  needsYou: number;
  blocked: number;
  at: number;
  of: number;
  now: number;
}) {
  const parts = () => props.path.split("/");
  return (
    <footer class="flex items-stretch overflow-hidden border-t border-rule bg-bg-sunk text-[11px] whitespace-nowrap text-muted">
      <span class="flex min-w-[9ch] items-center justify-center bg-ink px-3 font-bold tracking-[.1em] text-bg">
        NORMAL
      </span>
      <span class="block min-w-0 flex-1 truncate px-3 leading-[25px]">
        {props.root}/{parts().slice(0, -1).join("/")}/
        <b class="font-normal text-ink-2">{parts().at(-1)}</b>
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
