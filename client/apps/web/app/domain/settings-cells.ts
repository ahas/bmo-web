// The cells a settings table is built of (docs/web.md, 「Settings」): a cell that is pressed to change what it
// shows, and one that only shows it. Every screen whose settings stand as a table draws its cells with these.

// A cell that is pressed, as one box from edge to edge of its column and from top to bottom of its row, so the whole
// cell answers a hover and a press however tall a neighbouring cell makes the row.
export const CELL_BUTTON =
  "relative flex h-full min-h-12 w-full min-w-0 flex-col items-start justify-center px-2 py-1 text-start transition-colors hover:bg-elevated active:bg-accented focus-inset disabled:cursor-default disabled:hover:bg-transparent disabled:active:bg-transparent";

// A cell that only shows what a unit worked out, filling its cell the same way.
export const CELL_TEXT = "flex h-full min-h-12 min-w-0 flex-col justify-center px-2 py-1";

// A field in a cell's dropdown, which is as wide as what it holds: the sentence a refusal stands under the field in
// wraps at the width the field's own controls give the dropdown, rather than widening it once it appears.
export const CELL_FIELD_UI = { error: "w-0 min-w-full" };

// One choice a choice cell offers, or, as a `label`, the head of a group of them that is not chosen itself.
export interface CellChoice {
  value: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
  type?: "label";
}
