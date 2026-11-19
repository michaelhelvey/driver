import { createParts } from "@ui-sdk/solid/primitive";
import { cursorList } from "./cursor-list.ts";

/**
 * Solid parts of {@link cursorList}: a `div` listbox and `div` rows keyed by `value`.
 *
 * @example
 * <CursorList aria-label="Projects" cursor={slug()} onCursorChange={select}>
 *   <For each={slugs()}>{(slug) => <CursorListRow value={slug}>{slug}</CursorListRow>}</For>
 * </CursorList>
 */
export const { Root: CursorList, Row: CursorListRow } = createParts(cursorList, {
  root: "div",
  row: "div",
});
