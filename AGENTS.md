## Toolchains

- Use Vite+ (`vp`) for linting, formatting, and type checks. Configure it in `vite.config.ts`.
- Use bun for package management and runtime code, including unit tests (https://bun.sh/llms.txt)

## General Rules

- Always validate your work via all relevant checks (`bun run validate`) before declaring your work
  done.

## Project

- The build plan is [`docs/plan.md`](docs/plan.md). Read it before you start work.
- The design reference is [`mockups/driver.html`](mockups/driver.html). Open it in a browser and
  press `?`. `mockups/` is excluded from `vp fmt`: the formatter indents the embedded files and
  breaks their frontmatter.

## References

Prefer the docs inside `node_modules`: they match the installed version. The paths below exist after
`bun install`.

### Solid 2.0

This project uses Solid 2.0 (`solid-js` 2.x with `@solidjs/web`). Most training data is Solid 1.x,
and many 1.x patterns fail silently in 2.0.

- Before you write Solid code, read `node_modules/solid-js/CHEATSHEET.md`, especially the last
  section, "What changed from 1.x".
- Skills: `node_modules/solid-js/skills/solid-2.0/SKILL.md` (primer, read before the first edit),
  `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` (every warning code and its fix),
  `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md` (capture evidence, assert re-run
  budgets).
- A console warning with a bracketed code, such as `[REACTIVE_WRITE_IN_OWNED_SCOPE]`, is a defect.
  Look it up in the repair guide. Do not suppress it.
- Verify reactive changes with `captureArtifact` and `expectNoDiagnostics` from
  `@solidjs/diagnostics`.
- Lint with `eslint-plugin-solid/configs/v2` through oxlint `jsPlugins` (in `vite.config.ts`).
- Docs: https://docs.solidjs.com/llms.txt (index), https://docs.solidjs.com/llms-small.txt (the 2.0
  rules). Add `.md` to any docs page URL to get Markdown. AI guide:
  https://docs.solidjs.com/guides/ai-tools.

Rules that cause most bugs:

- Do not destructure props. Read `props.name` inside JSX, a memo, or an effect.
- `createEffect(compute, apply)` takes two functions. One argument is an error.
- Write stores through the draft: `setStore(s => { s.user.name = "Ada" })`. No path setters, no
  `produce`.
- Read reactive values inside JSX, a memo, or an effect, not at the top of a component body.
- Do not write a signal or store from a memo, an effect's compute function, or a component body.
- Renamed: `solid-js/web` → `@solidjs/web`, `Suspense` → `Loading`, `ErrorBoundary` → `Errored`,
  `onMount` → `onSettled`, `createResource` → async `createMemo`, `Index` → `<For keyed={false}>`,
  `classList` → `class={{ ... }}`, `Context.Provider` → `<Context value={...}>`. The cheatsheet has
  the full list.

### ui-sdk (`@ui-sdk/solid`, `@ui-sdk/core`)

Headless components and behaviors (focus, keyboard, lists, popups) with a Solid 2 adapter. It is in
beta, so check the installed docs, not memory.

- Read `node_modules/@ui-sdk/solid/docs/llms.txt` before you use a component.
- To build a custom component, search `node_modules/@ui-sdk/solid/docs/core.md` by heading, and read
  `rendering.md` next to it.
- Skill: `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md` (or
  `npx skills@latest add vercel-labs/ui --skill ui-sdk`).
- Import each component from its own entry: `@ui-sdk/solid/dialog`, `@ui-sdk/solid/command`.
- With Vite, set `optimizeDeps: { exclude: ["@ui-sdk/core"] }`.
- Docs: https://ui-sdk.dev/docs/solid/llms.txt, https://ui-sdk.dev/docs/core/llms.txt. Testing:
  https://ui-sdk.dev/docs/core/testing.

### Styling (Tailwind v4)

- Style ui-sdk parts by `data-slot` and their state attributes, as Tailwind variants
  (`data-highlighted:bg-focus`). See https://ui-sdk.dev/docs/core/kernel/style-a-component and
  https://ui-sdk.dev/docs/solid/styling-and-animation.md.
- Put `@layer ui-sdk;` above `@import "tailwindcss";` in the global stylesheet.
- Design tokens come from the CSS variables in `mockups/driver.html`.
- `"Berkeley Mono"` is installed on the user's machine. Reference it by name. Do not bundle it.

### Tauri v2

- Docs: https://v2.tauri.app/llms.txt.
- Keep the Rust side to plugins: `tauri-plugin-fs` (read-only scope `$HOME/.driver/**`, `watch`
  feature), `tauri-plugin-clipboard-manager`.

### MCP

- Use the official MCP TypeScript SDK with the stdio transport.
- Docs: https://modelcontextprotocol.io/llms.txt.
