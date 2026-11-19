import type { Status } from "@driver/core";

/** The glyph and color class of each task status, as the mockup draws them. */
export const STATUS: Readonly<Record<Status["kind"], { glyph: string; color: string }>> = {
  "needs-you": { glyph: "◆", color: "text-amber" },
  blocked: { glyph: "✕", color: "text-plum" },
  doing: { glyph: "◐", color: "text-accent" },
  todo: { glyph: "○", color: "text-muted" },
  done: { glyph: "●", color: "text-sage" },
  skipped: { glyph: "–", color: "text-faint" },
};
