import { Show } from "solid-js";

const KEEPS = new Set(["Enter", "ArrowDown"]);

/**
 * The task filter above the page, shown while it is edited or holds a query. Typing filters;
 * Enter or ↓ keeps the filter and goes back to the list, Escape clears it. The field is
 * uncontrolled: the query starts it, then typing leads, so a re-render never writes a stale
 * query over keys typed since.
 *
 * @example
 * <FilterBar query={q()} editing={editing()} shown={3} total={27} onQuery={setQ} onEditing={setEditing} onDone={done} />
 */
export function FilterBar(props: {
  query: string;
  editing: boolean;
  shown: number;
  total: number;
  onQuery: (query: string) => void;
  onEditing: (editing: boolean) => void;
  /** The user is done editing: `keep` the query, or clear it. */
  onDone: (keep: boolean) => void;
}) {
  return (
    <Show when={props.editing || props.query !== ""}>
      <div class="flex items-center gap-3 border-b border-rule bg-bg-sunk px-13 py-2.5 text-[12.5px]">
        <span class="font-bold text-amber">/</span>
        <input
          aria-label="Filter tasks"
          data-testid="filter"
          spellcheck="false"
          autocomplete="off"
          placeholder="filter tasks…"
          class="flex-1 bg-transparent text-ink caret-amber outline-none placeholder:text-faint"
          defaultValue={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onFocus={(event) => {
            event.currentTarget.select();
            props.onEditing(true);
          }}
          onBlur={() => props.onEditing(false)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" && !KEEPS.has(event.key)) return;
            event.preventDefault();
            props.onDone(event.key !== "Escape");
          }}
        />
        <span data-testid="filter-count" class="text-[11.5px] text-muted">
          <Show when={props.query !== ""}>
            {props.shown} of {props.total}
          </Show>
        </span>
        <span class="flex items-center gap-1.5 text-[11px] text-muted">
          <kbd>↵</kbd> keep <kbd>esc</kbd> clear
        </span>
      </div>
    </Show>
  );
}
