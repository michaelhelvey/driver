import { For } from "solid-js";
import { KEYS } from "./keys.ts";
import { Overlay } from "./overlay.tsx";
import { STATUS } from "./status.ts";

function Keys(props: { keys: readonly string[] }) {
  return (
    <span class="flex gap-1">
      <For each={props.keys}>
        {(key) => (key === "…" ? <span class="text-faint">…</span> : <kbd>{key}</kbd>)}
      </For>
    </span>
  );
}

/**
 * The keys sheet (`?`): every key the app binds, from the same table that binds them, and the
 * status glyphs. Escape, `?` and `q` close it.
 *
 * @example
 * <Help open={view.state.overlay === "help"} onClose={close} finalFocus={cursorRow} />
 */
export function Help(props: {
  open: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
}) {
  return (
    <Overlay
      title="keys"
      open={props.open}
      onClose={() => props.onClose()}
      finalFocus={() => props.finalFocus()}
      initialFocus="content"
      onKeyDown={(event) => {
        if (event.key === "?" || event.key === "q") props.onClose();
      }}
      class="top-[9vh] w-[min(780px,94vw)] px-[30px] pt-[26px] pb-[22px]"
    >
      <h3 aria-hidden="true" class="mb-1 text-[15px] font-bold tracking-[-.01em]">
        keys
      </h3>
      <div class="mb-4.5 text-[12px] text-muted">
        nothing here needs a mouse. nothing here can write, either — agents own the files.
      </div>
      <div class="grid grid-cols-2 gap-x-10 gap-y-1.5">
        <For each={KEYS}>
          {(group) => (
            <div class="mb-3.5">
              <div class="mb-1.5 flex items-center gap-2 text-[10.5px] tracking-[.12em] text-muted after:h-px after:flex-1 after:bg-rule after:content-['']">
                {group.group}
              </div>
              <For each={group.rows}>
                {(row) => (
                  <div data-testid="help-row" class="grid grid-cols-[13ch_1fr] items-center py-0.5">
                    <Keys keys={row.show} />
                    <span class="text-ink-2">{row.does}</span>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
      <div class="mt-2 flex gap-4.5 border-t border-dashed border-rule pt-3.5 text-[12px] text-ink-2">
        <For each={Object.entries(STATUS)}>
          {([status, look]) => (
            <span>
              <span class={look.color}>{look.glyph}</span> {status}
            </span>
          )}
        </For>
      </div>
    </Overlay>
  );
}
