import YAML from "yaml";
import { z } from "zod";
import {
  LogEntrySchema,
  StatusSchema,
  type LogEntry,
  type Status,
  type TaskFrontmatter,
} from "./schemas.ts";

const FRONTMATTER = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)([\s\S]*)$/;
const HEADING = /^## /m;
const STEP = /^\s*[-*] \[([ xX])\]/gm;

/**
 * Throws an `Error` with `message`. For use in expressions: `map.get(id) ?? fail("no id")`.
 *
 * @example
 * const phase = phases.find((p) => p.id === id) ?? fail(`no phase "${id}"`);
 */
export function fail(message: string): never {
  throw new Error(message);
}

/**
 * Parses `value` with `schema`, or throws an `Error` that names `path`.
 *
 * @example
 * parseAt("01-a/phase.md", PhaseFrontmatterSchema, { title: "a" });
 */
export function parseAt<S extends z.ZodType>(path: string, schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  return result.success ? result.data : fail(`${path}: ${z.prettifyError(result.error)}`);
}

/**
 * Drops the keys whose value is `undefined`.
 *
 * @example
 * compact({ a: 1, b: undefined }); // { a: 1 }
 */
export function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

/**
 * Splits a markdown file into frontmatter, validated by `schema`, and its trimmed body.
 *
 * @example
 * readDoc("01-a/phase.md", "---\ntitle: a\n---\nNote.\n", PhaseFrontmatterSchema);
 * // { data: { title: "a" }, body: "Note." }
 */
export function readDoc<S extends z.ZodType>(
  path: string,
  text: string,
  schema: S,
): { data: z.infer<S>; body: string } {
  const [, yaml, body] = FRONTMATTER.exec(text) ?? fail(`${path}: no frontmatter`);
  return { data: parseAt(path, schema, readYaml(path, yaml ?? "")), body: String(body).trim() };
}

const AnyFrontmatterSchema = z.record(z.string(), z.unknown());

/**
 * Splits any file of a project into its frontmatter, as plain data in file order, and its trimmed
 * body. For showing a file as it is; use the file's own schema to read its fields.
 *
 * @example
 * readFrontmatter("01-a/01-b.md", "---\ntitle: b\npr: \"#2\"\n---\n\nNote.\n");
 * // { data: { title: "b", pr: "#2" }, body: "Note." }
 */
export function readFrontmatter(
  path: string,
  text: string,
): { data: Record<string, unknown>; body: string } {
  return readDoc(path, text, AnyFrontmatterSchema);
}

const readYaml = (path: string, yaml: string): unknown => {
  const doc = YAML.parseDocument(yaml);
  const error = doc.errors[0];
  return error === undefined ? doc.toJS() : fail(`${path}: ${error.message}`);
};

/**
 * Writes frontmatter and a body as a markdown file. Keys with `undefined` values are left out, and
 * YAML quotes values where needed (`pr: "#204"`).
 *
 * @example
 * writeDoc({ title: "a", pr: "#2" }, "Note.");
 * // "---\ntitle: a\npr: \"#2\"\n---\n\nNote.\n"
 */
export function writeDoc(data: Record<string, unknown>, body: string): string {
  const yaml = YAML.stringify(compact(data), { lineWidth: 0 });
  return `---\n${yaml}---\n${body === "" ? "" : `\n${body}\n`}`;
}

/**
 * Reads a task's flat status fields into a {@link Status}. Fields of other statuses are an error.
 *
 * @example
 * readStatus("01-a/01-b.md", { status: "needs-you", ask: "200ms?" }); // { kind: "needs-you", ask: "200ms?" }
 */
export function readStatus(
  path: string,
  data: Pick<TaskFrontmatter, "status" | "ask" | "blocked_on" | "blocked_by" | "why">,
): Status {
  const flat = { kind: data.status, ask: data.ask, on: data.blocked_on, by: data.blocked_by };
  return parseAt(path, StatusSchema, compact({ ...flat, why: data.why }));
}

/**
 * Writes a {@link Status} as flat frontmatter fields.
 *
 * @example
 * flattenStatus({ kind: "blocked", on: "merge" }); // { status: "blocked", blocked_on: "merge", ... }
 */
export function flattenStatus(
  status: Status,
): Pick<TaskFrontmatter, "status" | "ask" | "blocked_on" | "blocked_by" | "why"> {
  const fields: { kind: Status["kind"]; ask?: string; on?: string; by?: string; why?: string } =
    status;
  return {
    status: fields.kind,
    ask: fields.ask,
    blocked_on: fields.on,
    blocked_by: fields.by,
    why: fields.why,
  };
}

/**
 * Splits the body of `log.md` into entries at its `## <timestamp>` headings, in file order.
 *
 * @example
 * readLog("log.md", "## 2026-11-19T07:38:00Z\n\nOn alpha.");
 * // [{ at: "2026-11-19T07:38:00Z", text: "On alpha." }]
 */
export function readLog(path: string, body: string): LogEntry[] {
  const [head = "", ...chunks] = body.split(HEADING);
  return head.trim() === ""
    ? chunks.map((chunk) => {
        const [at = "", ...text] = chunk.split("\n");
        return parseAt(path, LogEntrySchema, { at: at.trim(), text: text.join("\n").trim() });
      })
    : fail(`${path}: text before the first entry`);
}

/**
 * Writes the body of `log.md`.
 *
 * @example
 * writeLog([{ at: "2026-11-19T07:38:00Z", text: "On alpha." }]); // "## 2026-11-19T07:38:00Z\n\nOn alpha."
 */
export function writeLog(entries: readonly LogEntry[]): string {
  return entries.map((entry) => `## ${entry.at}\n\n${entry.text}`).join("\n\n");
}

/**
 * Splits the body of `project.md` into the summary (before the first `## `) and the rest.
 *
 * @example
 * splitSummary("Hi.\n\n## decisions\n- x"); // { summary: "Hi.", body: "## decisions\n- x" }
 */
export function splitSummary(text: string): { summary: string; body: string } {
  const at = text.search(HEADING);
  const cut = at === -1 ? text.length : at;
  return { summary: text.slice(0, cut).trim(), body: text.slice(cut).trim() };
}

/**
 * Counts the `- [ ]` / `- [x]` lines of a body.
 *
 * @example
 * countSteps("- [x] a\n- [ ] b"); // { done: 1, total: 2 }
 */
export function countSteps(body: string): { done: number; total: number } {
  const marks = [...body.matchAll(STEP)].map((match) => match[1]);
  return { done: marks.filter((mark) => mark !== " ").length, total: marks.length };
}

/**
 * Formats a date as a {@link TimestampSchema} string (whole seconds, `Z`).
 *
 * @example
 * stamp(new Date("2026-11-19T07:38:12.345Z")); // "2026-11-19T07:38:12Z"
 */
export function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
