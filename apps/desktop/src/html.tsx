import { Dynamic, type JSX } from "@solidjs/web";
import { htmlOf, type SafeHtml } from "./markdown.ts";

/**
 * Renders HTML made by `renderMarkdown`, `renderInline` or `renderRaw`, which escape every piece
 * of agent-written text. It only takes their {@link SafeHtml}, so no other string reaches the
 * page as markup.
 *
 * @example
 * <Html as="article" class="md" html={renderMarkdown(body)} />
 */
export function Html(props: {
  as: "div" | "span" | "article" | "pre";
  html: SafeHtml;
  class?: JSX.HTMLAttributes<HTMLElement>["class"];
  "data-testid"?: string;
}) {
  return (
    <Dynamic
      component={props.as}
      class={props.class}
      data-testid={props["data-testid"]}
      // oxlint-disable-next-line solid/no-innerhtml -- SafeHtml only comes from markdown.ts, which escapes
      innerHTML={htmlOf(props.html)}
    />
  );
}
