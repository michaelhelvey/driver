import { createSignal, onSettled, type Accessor } from "solid-js";

/**
 * How long ago `iso` was, as the mockup writes it: `now`, `12m`, `3h`, `2d`.
 *
 * @example
 * ago("2026-11-19T07:02:00Z", Date.parse("2026-11-19T07:40:00Z")); // "38m"
 */
export function ago(iso: string, now: number): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  const hours = Math.round(minutes / 60);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * The current time in ms, updated every `everyMs` for the life of the calling component.
 *
 * @example
 * const now = createNow();
 * <span>{ago(task.updated, now())}</span>
 */
export function createNow(everyMs = 30_000): Accessor<number> {
  const [now, setNow] = createSignal(Date.now(), { name: "now" });
  onSettled(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  });
  return now;
}
