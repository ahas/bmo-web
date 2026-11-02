import type { StopTarget } from "./types";

// The role slots as the live status screen draws them (docs/web.md, 「Live status screen」; the agency's
// docs/role-slots.md): a row to a role, a tile to every slot its cap gives, read from the agency's `GET /slots`.

/** What holds a working tile: the run its slot is let in for. */
export interface SlotTileRun {
  // What the run works in: the repository whose checkout its path is, by its label, or the folder's last part.
  place: string;
  path: string | null;
  // The source that asked for the slot, in the pack's words.
  source: string;
  provider: string | null;
  model: string | null;
  // Since when the run holds the slot, in epoch milliseconds; none where the agency does not say.
  since: number | null;
  // The line naming the work the slot was asked for, where its asker named one.
  title: string | null;
  // The run the tile's log opens at: its job's run where the agency names the job, else the run its binding names;
  // none while it is bound to nothing.
  log: string | null;
  // What a stop of the tile names: a job's run is stopped through its item, as every job is; a run the console can
  // tie to no item names none.
  stop: StopTarget | null;
}

/** One slot: a run holds it, a reservation keeps it for an owner that has not used it yet, or nobody is in it. */
export interface SlotTile {
  state: "working" | "reserved" | "idle";
  run: SlotTileRun | null;
}

/** One role's row: what the role is called, its cap, how many of its slots are in use and how many runs wait. */
export interface SlotRow {
  role: string;
  label: string;
  cap: number;
  used: number;
  waiting: number;
  tiles: SlotTile[];
}

export interface SlotBoard {
  // When the agency was read, in epoch milliseconds.
  readAt: number;
  rows: SlotRow[];
}
