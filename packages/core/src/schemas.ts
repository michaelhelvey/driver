import { z } from "zod";

const RESERVED_IDS = new Set(["project", "log"]);

/**
 * The regex source of an id, without anchors, for building path patterns.
 *
 * @example
 * new RegExp(`^\\d+-(${ID_PATTERN})$`).test("03a-framework-apps");
 */
export const ID_PATTERN = "[a-z0-9][a-z0-9._-]*";

/**
 * A project slug, phase id, or task id: the file or folder name without its `NN-` prefix.
 *
 * @example
 * IdSchema.parse("plugin-sitemap"); // "plugin-sitemap"
 * IdSchema.safeParse("log").success; // false: "project" and "log" are read refs
 */
export const IdSchema = z
  .string()
  .regex(new RegExp(`^${ID_PATTERN}$`), "use lowercase letters, digits, `.`, `_` and `-`")
  .refine((id) => !RESERVED_IDS.has(id), "`project` and `log` are reserved");

/**
 * One line of text with no line breaks.
 *
 * @example
 * LineSchema.parse("  review #31 "); // "review #31"
 */
export const LineSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^\n]*$/, "must be one line");

/**
 * An ISO 8601 UTC timestamp with whole seconds. One format, so timestamps sort as strings.
 *
 * @example
 * TimestampSchema.parse("2026-11-19T07:38:00Z");
 */
export const TimestampSchema = z.iso.datetime({ precision: 0 });

const NO_LOG_HEADING = /^## /m;

/**
 * Free markdown that must not contain a `## ` heading line, because `## ` splits `log.md` entries
 * and ends the project summary.
 *
 * @example
 * TextSchema.safeParse("## nope").success; // false
 */
export const TextSchema = z
  .string()
  .trim()
  .min(1)
  .refine((text) => !NO_LOG_HEADING.test(text), "must not contain a `## ` heading line");

/**
 * The part of `project.md` after the summary. It is empty or starts with a `## ` heading.
 *
 * @example
 * ProjectBodySchema.parse("## decisions\n\n- ...");
 */
export const ProjectBodySchema = z
  .string()
  .trim()
  .refine((body) => body === "" || body.startsWith("## "), "must start with a `## ` heading");

/**
 * A markdown body. `body` replaces the whole body of the file.
 *
 * @example
 * BodySchema.parse("- [ ] alpha verified\n");
 */
export const BodySchema = z
  .string()
  .trim()
  .describe(
    "Replaces the whole markdown body. `- [ ]` / `- [x]` lines are counted as the task's steps.",
  );

/**
 * A task status. The API uses this tagged union; files store it flat (`status` + `ask` /
 * `blocked_on` / `blocked_by` / `why`).
 *
 * @example
 * StatusSchema.parse({ kind: "blocked", on: "async-render merge", by: "plugin-sitemap" });
 */
export const StatusSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("todo") }),
  z.strictObject({ kind: z.literal("doing") }),
  z.strictObject({ kind: z.literal("done") }),
  z
    .strictObject({ kind: z.literal("needs-you"), ask: LineSchema })
    .describe("one line saying exactly what you need from the user."),
  z
    .strictObject({ kind: z.literal("blocked"), on: LineSchema, by: IdSchema.optional() })
    .describe("`on` is what it's waiting for; `by` is the id of a blocking task."),
  z.strictObject({ kind: z.literal("skipped"), why: LineSchema }),
]);

/** A task status, see {@link StatusSchema}. */
export type Status = z.infer<typeof StatusSchema>;

/**
 * Frontmatter of `project.md`.
 *
 * @example
 * ProjectFrontmatterSchema.parse({ title: "driver", repo: "~/dev/driver", started: "2026-11-19", updated: "2026-11-19T07:39:00Z" });
 */
export const ProjectFrontmatterSchema = z.strictObject({
  title: LineSchema,
  repo: LineSchema,
  started: z.iso.date(),
  updated: TimestampSchema,
});

/** Frontmatter of `project.md`, see {@link ProjectFrontmatterSchema}. */
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;

/**
 * Frontmatter of a `phase.md`.
 *
 * @example
 * PhaseFrontmatterSchema.parse({ title: "canaries" });
 */
export const PhaseFrontmatterSchema = z.strictObject({ title: LineSchema });

/**
 * Frontmatter of `log.md`.
 *
 * @example
 * LogFrontmatterSchema.parse({ title: "log" });
 */
export const LogFrontmatterSchema = z.strictObject({ title: z.literal("log") });

/**
 * Frontmatter of a task file, with the status stored flat. Which status fields are allowed is
 * checked when the flat fields are read into a {@link Status}.
 *
 * @example
 * TaskFrontmatterSchema.parse({ title: "plugin-sitemap", status: "todo", updated: "2026-11-17T20:54:00Z" });
 */
export const TaskFrontmatterSchema = z.strictObject({
  title: LineSchema,
  status: z.enum(["todo", "doing", "done", "needs-you", "blocked", "skipped"]),
  ask: LineSchema.optional(),
  blocked_on: LineSchema.optional(),
  blocked_by: IdSchema.optional(),
  why: LineSchema.optional(),
  repo: LineSchema.optional(),
  pr: LineSchema.optional(),
  updated: TimestampSchema,
});

/** Frontmatter of a task file, see {@link TaskFrontmatterSchema}. */
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;

/**
 * One `log.md` entry: a `## <timestamp>` heading and its text.
 *
 * @example
 * LogEntrySchema.parse({ at: "2026-11-19T07:38:00Z", text: "plugin-feed is on the example site." });
 */
export const LogEntrySchema = z.object({ at: TimestampSchema, text: z.string() });

/** One `log.md` entry, see {@link LogEntrySchema}. */
export type LogEntry = z.infer<typeof LogEntrySchema>;

/**
 * The `project` op of `apply`.
 *
 * @example
 * ProjectOpSchema.parse({ op: "project", summary: "Both canaries are green." });
 */
export const ProjectOpSchema = z
  .strictObject({
    op: z.literal("project"),
    summary: TextSchema.optional(),
    body: ProjectBodySchema.optional(),
  })
  .describe("update the project summary, or the rest of `project.md`.");

/**
 * The `phase` op of `apply`.
 *
 * @example
 * PhaseOpSchema.parse({ op: "phase", id: "cleanup", title: "cleanup", after: "canaries" });
 */
export const PhaseOpSchema = z
  .strictObject({
    op: z.literal("phase"),
    id: IdSchema,
    title: LineSchema.optional(),
    after: IdSchema.nullable().optional(),
    body: BodySchema.optional(),
  })
  .describe(
    "create, update, or reorder a phase. `after` is the id of the phase it should come after, or `null` to put it first.",
  );

/**
 * The `task` op of `apply`.
 *
 * @example
 * TaskOpSchema.parse({ op: "task", id: "plugin-sitemap", status: { kind: "done" } });
 */
export const TaskOpSchema = z
  .strictObject({
    op: z.literal("task"),
    id: IdSchema,
    phase: IdSchema.optional(),
    after: IdSchema.nullable().optional(),
    title: LineSchema.optional(),
    repo: LineSchema.optional(),
    pr: LineSchema.optional(),
    status: StatusSchema.optional(),
    body: BodySchema.optional(),
  })
  .describe(
    "create, update, move, or reorder a task. Setting `phase` moves it to another phase. `after` is the id of the task it should come after, in that task's phase, or `null` to put it first in its phase.",
  );

/**
 * One `apply` op.
 *
 * @example
 * OpSchema.parse({ op: "task", id: "plugin-sitemap", status: { kind: "doing" } });
 */
export const OpSchema = z.discriminatedUnion("op", [ProjectOpSchema, PhaseOpSchema, TaskOpSchema]);

/** One `apply` op, see {@link OpSchema}. */
export type Op = z.infer<typeof OpSchema>;

/**
 * The body of an `apply` call: a log line and the ops.
 *
 * @example
 * ApplyInputSchema.parse({ log: "plugin-sitemap merged as #64.", ops: [{ op: "task", id: "plugin-sitemap", status: { kind: "done" } }] });
 */
export const ApplyInputSchema = z.strictObject({
  log: TextSchema.describe(
    "One or two sentences saying what happened and the evidence for it. Added to `log.md`.",
  ),
  ops: z.array(OpSchema),
});

/** The body of an `apply` call, see {@link ApplyInputSchema}. */
export type ApplyInput = z.infer<typeof ApplyInputSchema>;
