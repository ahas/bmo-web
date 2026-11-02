import { countText } from "./numbers";
import { formatElapsed, modelLabel } from "./status";

import type { SlotRow, SlotTile } from "#shared/role-slots";
import type { Translate } from "#shared/wording";

// How the live status screen draws the role slots (docs/web.md, 「Live status screen」): a tile to a slot, told apart by
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

/** The lines a tile's tooltip carries: its state, then what holds it — the path, the source that asked for it, the
 * provider and model, and how long it has been there. `now` is in epoch milliseconds. */
export function tileLines(t: Translate, tile: SlotTile, now: number): string[] {
  const run = tile.run;
  const state = t(SLOT_STATE_LABELS[tile.state]);

  if (run === null) return [state];

  return [
    `${state} · ${run.source}`,
    run.path ?? run.place,
    ...([run.provider, run.model === null ? null : modelLabel(run.model)].some((part) => part !== null)
      ? [[run.provider, run.model === null ? null : modelLabel(run.model)].filter((part): part is string => part !== null).join(" · ")]
      : []),
    ...(run.since === null ? [] : [t("live.label.elapsed", { time: formatElapsed(t, (now - run.since) / 1000) })])
  ];
}
