import {
  ApplyOutputSchema,
  ApplyToolInputSchema,
  CreateProjectInputSchema,
  CreateProjectOutputSchema,
  GetProjectInputSchema,
  GetProjectOutputSchema,
  ListProjectsInputSchema,
  ListProjectsOutputSchema,
  NeedsMeInputSchema,
  NeedsMeOutputSchema,
  parseProject,
  planApply,
  planCreate,
  ReadInputSchema,
  ReadOutputSchema,
  renderListProjects,
  renderNeedsMe,
  renderProject,
  renderRead,
  type ApplyError,
  type Plan,
  type Project,
} from "@driver/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Disk } from "./disk.ts";

type Tool = {
  input: z.ZodObject;
  output: z.ZodObject;
  call: (disk: Disk, args: unknown) => Promise<Record<string, unknown>>;
};

const tool = <I extends z.ZodObject, O extends z.ZodObject>(
  input: I,
  output: O,
  run: (disk: Disk, args: z.infer<I>) => Promise<z.input<O>>,
): Tool => ({
  input,
  output,
  call: async (disk, args) => {
    const parsed = input.safeParse(args ?? {});
    if (!parsed.success) throw new Error(`invalid arguments:\n${z.prettifyError(parsed.error)}`);
    return output.parse(await run(disk, parsed.data));
  },
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parse = (slug: string, files: ReadonlyMap<string, string>): Project => {
  try {
    return parseProject(files);
  } catch (error) {
    throw new Error(`project "${slug}": ${messageOf(error)}`, { cause: error });
  }
};

const load = async (disk: Disk, slug: string) => {
  const files = await disk.readTree(slug);
  return { files, project: parse(slug, files) };
};

const loadAll = async (disk: Disk): Promise<Map<string, Project>> => {
  const slugs = await disk.projects();
  return new Map(
    await Promise.all(slugs.map(async (slug) => [slug, (await load(disk, slug)).project] as const)),
  );
};

const planned = (result: Plan | ApplyError): Plan => {
  if (result.kind === "error") throw new Error(result.message);
  return result;
};

const TOOLS: Record<string, Tool> = {
  list_projects: tool(ListProjectsInputSchema, ListProjectsOutputSchema, async (disk) =>
    renderListProjects(await loadAll(disk)),
  ),

  get_project: tool(GetProjectInputSchema, GetProjectOutputSchema, async (disk, { slug }) =>
    renderProject(slug, (await load(disk, slug)).project),
  ),

  read: tool(ReadInputSchema, ReadOutputSchema, async (disk, { slug, refs }) => {
    const { files, project } = await load(disk, slug);
    return renderRead(project, files, refs);
  }),

  needs_me: tool(NeedsMeInputSchema, NeedsMeOutputSchema, async (disk) =>
    renderNeedsMe(await loadAll(disk)),
  ),

  create_project: tool(CreateProjectInputSchema, CreateProjectOutputSchema, async (disk, args) => {
    const plan = planned(planCreate(args, new Date()));
    await disk.create(args.slug);
    await disk.locked(args.slug, () => disk.execute(args.slug, plan.steps));
    return { slug: args.slug };
  }),

  apply: tool(ApplyToolInputSchema, ApplyOutputSchema, (disk, { slug, ...input }) =>
    disk.locked(slug, async () => {
      const { project } = await load(disk, slug);
      const plan = planned(planApply(project, input, new Date()));
      await disk.execute(slug, plan.steps);
      return { slug, changed: plan.changed };
    }),
  ),
};

const LISTING = Object.entries(TOOLS).map(([name, { input, output }]) =>
  ToolSchema.parse({
    name,
    description: input.description,
    inputSchema: z.toJSONSchema(z.strictObject(input.shape), { io: "input" }),
    outputSchema: z.toJSONSchema(output, { io: "output" }),
  }),
);

const LogFieldsSchema = z
  .object({
    slug: z.string().nullable().default(null).catch(null),
    ops: z.array(z.unknown()).default([]).catch([]),
  })
  .catch({ slug: null, ops: [] });

const logCall = (name: string, args: unknown, started: number, error: string | null): void => {
  const { slug, ops } = LogFieldsSchema.parse(args);
  const ms = Math.round(performance.now() - started);
  const line = { tool: name, project: slug, ops: ops.length, ms, error };
  process.stderr.write(`${JSON.stringify(line)}\n`);
};

const callTool = async (disk: Disk, name: string, args: unknown): Promise<CallToolResult> => {
  const started = performance.now();
  try {
    const found = TOOLS[name];
    if (found === undefined) throw new Error(`no tool "${name}"`);
    const out = await found.call(disk, args);
    logCall(name, args, started, null);
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  } catch (error) {
    logCall(name, args, started, messageOf(error));
    return { isError: true, content: [{ type: "text", text: messageOf(error) }] };
  }
};

/**
 * Makes the driver MCP server with its six tools over `disk`. Each tool's input schema
 * `.describe()` text from `@driver/core` is its description. Every call is logged to stderr as one
 * JSON line: `{ tool, project, ops, ms, error }`.
 *
 * @example
 * const server = createServer(createDisk(root, { lockTimeoutMs: 10_000 }));
 * await server.connect(new StdioServerTransport());
 */
export function createServer(disk: Disk): Server {
  const server = new Server({ name: "driver", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: LISTING }));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(disk, request.params.name, request.params.arguments),
  );
  return server;
}
