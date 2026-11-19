import type { JSX } from "@solidjs/web";
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog";

/**
 * A modal card over a blurred page, like the mockup's palette and keys sheet. Escape and a press
 * outside close it; focus goes where `finalFocus` says, since nothing on the page opens it.
 *
 * @example
 * <Overlay title="keys" open={open()} onClose={close} class="top-[9vh] w-[min(780px,94vw)]">…</Overlay>
 */
export function Overlay(props: {
  title: string;
  open: boolean;
  onClose: () => void;
  class: string;
  initialFocus?: "content";
  finalFocus: () => HTMLElement | null;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: JSX.Element;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogBackdrop class="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--bg)_60%,transparent)] backdrop-blur-[3px] backdrop-saturate-[.9]" />
      <DialogContent
        initialFocus={props.initialFocus ?? "auto"}
        finalFocus={() => props.finalFocus() ?? undefined}
        onKeyDown={(event) => props.onKeyDown?.(event)}
        class={[
          "fixed left-1/2 z-50 m-0 -translate-x-1/2 overflow-hidden rounded-xl border border-rule bg-panel text-ink shadow-card outline-none animate-rise",
          props.class,
        ]}
      >
        <DialogTitle class="sr-only">{props.title}</DialogTitle>
        {props.children}
      </DialogContent>
    </Dialog>
  );
}
