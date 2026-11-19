import type { JSX } from "@solidjs/web";
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area";

/**
 * A scrolling pane with a thin scrollbar that shows while the pointer is over it or it scrolls.
 * `class` sizes the pane; `content` styles what scrolls.
 *
 * The scrollbar is always laid out (`flex!` beats ui-sdk's inline `display: none` while nothing
 * overflows). ui-sdk learns about overflow in the viewport's ResizeObserver callback and only then
 * shows the scrollbar, a sibling of the viewport with its own observer, so its first size change
 * cannot be delivered in the same pass: the browser reports "ResizeObserver loop completed with
 * undelivered notifications" when a pane starts to overflow, e.g. the reader opening on a long
 * file. Without overflow ui-sdk never marks it `data-visible`, so it stays transparent and
 * ignores the pointer.
 *
 * @example
 * <Pane label="Project" class="h-full" content="px-13"><Page /></Pane>
 */
export function Pane(props: {
  label: string;
  class?: string;
  content?: string;
  children: JSX.Element;
}) {
  return (
    <ScrollArea class={props.class}>
      <ScrollAreaViewport role="region" aria-label={props.label} class="h-full outline-none">
        <ScrollAreaContent class={props.content}>{props.children}</ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar class="flex! w-2 justify-center p-0.5 opacity-0 transition-opacity data-visible:opacity-100">
        <ScrollAreaThumb class="w-1 rounded-full bg-faint" />
      </ScrollAreaScrollbar>
    </ScrollArea>
  );
}
