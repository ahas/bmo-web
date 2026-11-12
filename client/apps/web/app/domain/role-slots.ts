import { countText } from "./numbers";
import { formatElapsed, modelLabel } from "./status";

import type { SlotRow, SlotTile, SlotTileRun } from "#shared/role-slots";
import type { Translate } from "#shared/wording";
import type { LogPlace } from "./log";

// How the monitor's role slots tab draws the role slots (docs/web.md, 「Monitor's role slots tab」): a tile to a slot, told apart by
// what holds it.

export const SLOT_STATE_LABELS: Record<SlotTile["state"], string> = {
  working: "live.label.slot_working",
  reserved: "live.label.slot_reserved",
  idle: "live.label.slot_idle"
};

export const SLOT_STATE_ICONS: Record<SlotTile["state"], string> = {
  working: "i-material-symbols-progress-activity",
  reserved: "i-material-symbols-bookmark-outline",
  idle: "i-material-symbols-bedtime-outline"
};

/** The head of a role's row: the role, how many of its slots are in use out of its cap, and how many runs wait. */
export function rowHead(t: Translate, row: SlotRow): string {
  const head = t("live.label.slot_row_head", { role: row.label, used: countText(row.used), cap: countText(row.cap) });

  return row.waiting > 0 ? t("live.label.slot_row_waiting", { head, n: countText(row.waiting) }) : head;
}

/** Where a working tile opens its role's log, in the order the agency's `docs/api.md` (「slots」) gives: at the run the
 * tile names, from its start; with no run named but a role session held, at the log's newest lines, which is no place
 * (null); with neither, at the moment the run took the slot; and at the newest lines where even that is not known. */
export function slotLogPlace(run: Pick<SlotTileRun, "log" | "session" | "since"> | null): LogPlace | null {
  if (run === null) return null;
  if (run.log !== null) return { run: run.log };
  if (run.session !== null || run.since === null) return null;

  return { at: Math.floor(run.since / 1000) };
}

/** The lines a tile's tooltip carries: its state and the source that asked for it, then what holds it — the line
 * naming its work, the path, the provider and model, and how long it has been there. `now` is in epoch milliseconds. */
export function tileLines(t: Translate, tile: SlotTile, now: number): string[] {
  const run = tile.run;
  const state = t(SLOT_STATE_LABELS[tile.state]);

  if (run === null) return [state];

  return [
    `${state} · ${run.source}`,
    ...(run.title === null ? [] : [run.title]),
    run.path ?? run.place,
    ...([run.provider, run.model === null ? null : modelLabel(run.model)].some((part) => part !== null)
      ? [[run.provider, run.model === null ? null : modelLabel(run.model)].filter((part): part is string => part !== null).join(" · ")]
      : []),
    ...(run.since === null ? [] : [t("live.label.elapsed", { time: formatElapsed(t, (now - run.since) / 1000) })])
  ];
}
