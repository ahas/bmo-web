// How a settings table lays its columns out (docs/web.md, 「Agent management screen」): as a spreadsheet does. Every
// column stands at its own width — what its content asks, up to a ceiling of its own where its cells vary in length —
// and no column takes the room left over, which stays empty at the table's right edge.

import type { TableColumn } from "@nuxt/ui";

// A settings table's column: the shared table's column, one whose cells vary in length carrying the ceiling it stands
// at most at.
export type SettingsColumn<T> = TableColumn<T> & { ceiling?: number };

// What one column asks: the width its name and its widest cell take whole, and its ceiling.
export interface ColumnAsk {
  id: string;
  content: number;
  ceiling?: number;
}

/** The width of every column in whole pixels: its content's, up to its ceiling. */
export function columnWidths(asks: readonly ColumnAsk[]): Record<string, number> {
  return Object.fromEntries(asks.map((ask) => [ask.id, Math.min(Math.max(0, Math.ceil(ask.content)), ask.ceiling ?? Number.POSITIVE_INFINITY)]));
}
