# @driver/mcp

The stdio MCP server for driver: six tools (`list_projects`, `get_project`, `read`, `needs_me`,
`create_project`, `apply`) over the project folders under `DRIVER_ROOT`. It is the only writer. See
[`docs/plan.md`](../../docs/plan.md) for the file format and the write protocol.

```sh
bun packages/mcp/src/main.ts
```

| env                      | default     | meaning                                                |
| ------------------------ | ----------- | ------------------------------------------------------ |
| `DRIVER_ROOT`            | `~/.driver` | the folder that holds the projects; created if missing |
| `DRIVER_LOCK_TIMEOUT_MS` | `10000`     | how long `apply` waits for another `apply`'s `.lock`   |

stdout carries only MCP messages. Each tool call is logged to stderr as one JSON line:
`{"tool":"apply","project":"pinion-2-plugins","ops":1,"ms":12,"error":null}`.

If `apply` fails with `<project>/.lock is still there`, a crashed `apply` left the lock behind.
Delete the file if no other `apply` is running.

## Register it

`bun run setup` in the repo root registers it in OpenCode (see the root
[Quickstart](../../README.md#quickstart)). The server sends `DRIVER_INSTRUCTIONS` from
`@driver/core` as its `initialize` `instructions`, which OpenCode adds to the system prompt, so
projects need no `AGENTS.md` snippet.

## Tests

`bun test packages/mcp`: `disk.test.ts` runs the fs adapter against a temp folder; `e2e.test.ts`
spawns the server over real stdio with the MCP client SDK against a temp copy of
`packages/core/fixtures`.
