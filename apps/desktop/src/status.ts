import type { Status } from "@driver/core";

/**
 * How the app draws each task status: its glyph, the glyph's color class, and the color
 * class of its segment in a phase's bar.
 */
export const STATUS: Readonly<
  Record<Status["kind"], { glyph: string; color: string; bar: string }>
> = {
  "needs-you": { glyph: "◆", color: "text-amber", bar: "bg-amber" },
  blocked: { glyph: "✕", color: "text-plum", bar: "bg-plum" },
  doing: { glyph: "◐", color: "text-accent", bar: "bg-accent" },
  todo: { glyph: "○", color: "text-muted", bar: "bg-faint" },
  done: { glyph: "●", color: "text-sage", bar: "bg-sage" },
  skipped: { glyph: "–", color: "text-faint", bar: "bg-faint" },
};
