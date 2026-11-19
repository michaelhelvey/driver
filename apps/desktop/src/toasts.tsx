import {
  createToaster,
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  type Toaster,
} from "@ui-sdk/solid/toast";

/** Shows short messages in the corner: what a key did, or why it could not. */
export type Notify = {
  /** A message, optionally with a detail shown in bold after it. */
  info: (title: string, detail?: string) => void;
  /** Something failed. Shown in plum and announced at once. */
  error: (title: string, detail?: string) => void;
};

/**
 * Creates the app's toast queue and the functions that add to it. Render the queue with
 * {@link Toasts}.
 *
 * @example
 * const toasts = createToasts();
 * toasts.notify.info("copied", path);
 * <Toasts toaster={toasts.toaster} />
 */
export function createToasts(): { toaster: Toaster; notify: Notify } {
  const toaster = createToaster<string>({ duration: 2600 });
  const show = (type: "default" | "error") => (title: string, detail?: string) => {
    toaster({ title, type, ...(detail === undefined ? {} : { description: detail }) });
  };
  return { toaster, notify: { info: show("default"), error: show("error") } };
}

/**
 * The toast region, bottom right over the status line, styled like the mockup's toast.
 *
 * @example
 * <Toasts toaster={toasts.toaster} />
 */
export function Toasts(props: { toaster: Toaster }) {
  return (
    <ToastRegion
      toaster={props.toaster}
      side="bottom"
      align="end"
      aria-label="Notifications"
      class="fixed right-[22px] bottom-[42px] z-60 m-0 flex max-w-[64vw] list-none flex-col items-end gap-2 p-0"
    >
      {() => (
        <Toast class="rounded-lg bg-ink px-3.5 py-[9px] text-[12px] text-bg shadow-card transition-[opacity,translate] duration-200 data-ending-style:opacity-0 data-starting-style:translate-y-1.5 data-starting-style:opacity-0 data-[type=error]:bg-plum">
          <ToastTitle class="inline" /> <ToastDescription class="inline font-bold break-all" />
        </Toast>
      )}
    </ToastRegion>
  );
}
