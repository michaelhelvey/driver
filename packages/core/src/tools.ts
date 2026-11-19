import { z } from "zod";
import {
  ApplyInputSchema,
  IdSchema,
  LineSchema,
  LogEntrySchema,
  OpSchema,
  StatusSchema,
  TextSchema,
  TimestampSchema,
} from "./schemas.ts";

const SlugSchema = IdSchema.describe("The project slug: its directory name under `~/.driver`.");

const signature = (schema: z.ZodObject, tag: string): string => {
  const fields = Object.entries(schema.shape).map(([key, field]) =>
    key === tag && field instanceof z.ZodLiteral
      ? `${key}: ${JSON.stringify(field.value)}`
      : `${key}${field.isOptional() ? "?" : ""}`,
  );
  return `{ ${fields.join(", ")} }`;
};

const bullets = (schemas: readonly z.ZodObject[], tag: string): string =>
  schemas
    .map((schema) => {
      const line = `- \`${signature(schema, tag)}\``;
      return schema.description === undefined ? line : `${line}: ${schema.description}`;
    })
    .join("\n");

const STATUS_CONTRACT = [
  "`status` is one of:",
  bullets(StatusSchema.options, "kind"),
  'There is no `broken` status. If your own work fails (a build breaks, a deploy fails, you are stuck), set `{ kind: "needs-you", ask }` with the error as the `ask`. Do not leave it `doing`: that hides the failure from the user.',
].join("\n\n");

/**
 * Input of `list_projects`. Its description is the tool description.
 *
 * @example
 * server.registerTool("list_projects", { description: ListProjectsInputSchema.description, inputSchema: ListProjectsInputSchema }, handler);
 */
export const ListProjectsInputSchema = z
  .strictObject({})
  .describe(
    "List every project under `~/.driver`. Returns each project's slug, title, percent complete, count of tasks that need the user, count of blocked tasks, and when it was last updated. Use this to find a project's slug, or to answer \"what's going on across my projects\".",
  );

/**
 * Input of `get_project`. Its description is the tool description.
 *
 * @example
 * GetProjectInputSchema.parse({ slug: "pdk-2-sentry" });
 */
export const GetProjectInputSchema = z
  .strictObject({ slug: SlugSchema })
  .describe(
    "Get a project's current state in one call: the summary from `project.md`, every phase in order with its one-line note, every task with its id, position label (`03a.1`), status, `ask` or `blocked_on`, step progress (`2/5`), repo, and PR, plus the 10 newest log entries. Call this before `apply` so your changes are based on the current state. Task bodies are not included; use `read` for those.",
  );

/**
 * Input of `read`. Its description is the tool description.
 *
 * @example
 * ReadInputSchema.parse({ slug: "pdk-2-sentry", refs: ["t4-coa", "log"] });
 */
export const ReadInputSchema = z
  .strictObject({
    slug: SlugSchema,
    refs: z
      .array(z.string().min(1))
      .min(1)
      .describe('Task or phase ids, or `"project"` or `"log"`.'),
  })
  .describe(
    'Read the raw markdown of one or more files in a project, exactly as they are on disk, frontmatter included. `refs` is a list of task or phase ids, or `"project"` or `"log"`. Use this when you need a task\'s full notes, verification steps, or checklist.',
  );

/**
 * Input of `needs_me`. Its description is the tool description.
 *
 * @example
 * NeedsMeInputSchema.parse({});
 */
export const NeedsMeInputSchema = z
  .strictObject({})
  .describe(
    "List every task across all projects that is `needs-you` or `blocked`, with its project, id, title, and the `ask` or `blocked_on` line. This is exactly what the user sees at the top of each project page. Use it when the user asks what's waiting on them.",
  );

/**
 * Input of `create_project`. Its description is the tool description.
 *
 * @example
 * CreateProjectInputSchema.parse({ slug: "driver", title: "driver", repo: "~/dev/driver", summary: "A tracker." });
 */
export const CreateProjectInputSchema = z
  .strictObject({
    slug: SlugSchema,
    title: LineSchema,
    repo: LineSchema.describe("The main repository path, e.g. `~/dev/t4/t4-platform-lambda`."),
    summary: TextSchema.describe(
      "What this project is and where it stands. Shown at the top of the project page.",
    ),
    rex: LineSchema.optional().describe(
      "Your `$REX_SESSION`. Leave it out if it is not set; never guess it.",
    ),
  })
  .describe(
    [
      "Create a new project directory with `project.md` and an empty `log.md`. `summary` is the free-text paragraph shown at the top of the project page: what this project is and where it stands. `rex` is optional: your `$REX_SESSION`, so the user can jump to you from the UI. Leave it out if `$REX_SESSION` is not set; never guess it. Fails if the slug already exists.",
      "Then add phases and tasks with `apply`.",
      STATUS_CONTRACT,
    ].join("\n\n"),
  );

/**
 * Input of `apply`. Its description is the tool description.
 *
 * @example
 * ApplyToolInputSchema.parse({ slug: "pdk-2-sentry", log: "t4-coa merged as #52.", ops: [] });
 */
export const ApplyToolInputSchema = ApplyInputSchema.extend({ slug: SlugSchema }).describe(
  [
    "The only way to change a project. Send every change in one call. The batch is checked as a whole and either all of it is written or none of it is. If anything is invalid, nothing is written and you get the validation error back.",
    '`log` is required: one or two sentences saying what happened and the evidence for it ("t4-coa merged as #52; beta deploy 4415 is green"). It is added to `log.md`. Describe what happened, not what you plan to do.',
    "Each op creates the item if the id is new, or updates it if it already exists. Fields you leave out stay unchanged. There is no delete: mark work that's no longer needed as `skipped` and give a reason.",
    bullets(OpSchema.options, "op"),
    "Without `after`, a new or moved item goes last, and an existing item stays where it is. `after: null` puts it first.",
    STATUS_CONTRACT,
    "`body` replaces the whole markdown body. Put notes, verification steps, and a checklist there. `- [ ]` / `- [x]` lines are counted as the task's steps.",
    "Files are renamed and renumbered, and `updated` is set, for you.",
  ].join("\n\n"),
);

/**
 * Done, open, and skipped task counts. `total` is all tasks minus skipped ones, and `percent` is
 * `done / total`, rounded down.
 *
 * @example
 * ProgressSchema.parse({ done: 9, total: 27, skipped: 1, percent: 33 });
 */
export const ProgressSchema = z.object({
  done: z.int(),
  total: z.int(),
  skipped: z.int(),
  percent: z.int(),
});

/** See {@link ProgressSchema}. */
export type Progress = z.infer<typeof ProgressSchema>;

/**
 * One row of `list_projects`.
 *
 * @example
 * ProjectSummarySchema.parse({ slug: "driver", title: "driver", percent: 33, needsYou: 1, blocked: 0, updated: "2026-11-19T07:39:00Z" });
 */
export const ProjectSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  percent: z.int(),
  needsYou: z.int(),
  blocked: z.int(),
  updated: TimestampSchema,
});

/** Output of `list_projects`. */
export const ListProjectsOutputSchema = z.object({ projects: z.array(ProjectSummarySchema) });

/** Output of `list_projects`, see {@link ListProjectsOutputSchema}. */
export type ListProjectsOutput = z.infer<typeof ListProjectsOutputSchema>;

/**
 * A task row in `get_project`. `steps` is `done/total` from the body's checkboxes.
 *
 * @example
 * TaskViewSchema.parse({ id: "t4-coa", label: "03a.1", title: "t4-coa", status: { kind: "todo" }, steps: "0/6" });
 */
export const TaskViewSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  status: StatusSchema,
  steps: z.string(),
  repo: z.string().optional(),
  pr: z.string().optional(),
});

/** Output of `get_project`. `nowIn` is the id of the first phase with open work. */
export const GetProjectOutputSchema = z.object({
  slug: z.string(),
  title: z.string(),
  repo: z.string(),
  rex: z.string().optional(),
  started: z.string(),
  updated: TimestampSchema,
  summary: z.string(),
  progress: ProgressSchema,
  nowIn: z.string().nullable(),
  phases: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      title: z.string(),
      note: z.string(),
      tasks: z.array(TaskViewSchema),
    }),
  ),
  log: z.array(LogEntrySchema),
});

/** Output of `get_project`, see {@link GetProjectOutputSchema}. */
export type GetProjectOutput = z.infer<typeof GetProjectOutputSchema>;

/** Output of `read`: one entry per ref, in the order asked. */
export const ReadOutputSchema = z.object({
  files: z.array(z.object({ ref: z.string(), path: z.string(), content: z.string() })),
});

/** Output of `read`, see {@link ReadOutputSchema}. */
export type ReadOutput = z.infer<typeof ReadOutputSchema>;

/** Output of `needs_me`: every `needs-you` and `blocked` task across projects. */
export const NeedsMeOutputSchema = z.object({
  tasks: z.array(
    z.object({
      project: z.string(),
      id: z.string(),
      label: z.string(),
      title: z.string(),
      status: StatusSchema,
    }),
  ),
});

/** Output of `needs_me`, see {@link NeedsMeOutputSchema}. */
export type NeedsMeOutput = z.infer<typeof NeedsMeOutputSchema>;

/** Output of `create_project`. */
export const CreateProjectOutputSchema = z.object({ slug: z.string() });

/** Output of `apply`: the paths that were written or moved, relative to the project directory. */
export const ApplyOutputSchema = z.object({ slug: z.string(), changed: z.array(z.string()) });
