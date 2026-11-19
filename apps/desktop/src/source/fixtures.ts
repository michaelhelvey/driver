import { memorySource, type MemorySource } from "./memory.ts";

const files = import.meta.glob<string>("../../../../packages/core/fixtures/*/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * The fixture projects of `packages/core/fixtures`, bundled by Vite, as an in-memory source for
 * browser dev.
 *
 * @example
 * const source = fixtureSource();
 * source.write("driver/log.md", "…"); // the page re-renders the driver project
 */
export function fixtureSource(): MemorySource {
  const tree = Object.entries(files).map(([path, text]): [string, string] => [
    path.replace(/^.*\/fixtures\//, ""),
    text,
  ]);
  return memorySource("packages/core/fixtures", new Map(tree));
}
