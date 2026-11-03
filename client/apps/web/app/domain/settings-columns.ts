// How a settings table gives out its box's width among its columns (docs/web.md, 「Agent management screen」): one
// column, the title, is flexible; every other column stands at its content's width, a column whose cells vary in
// length under a ceiling of its own where room is short. The widths are worked out here from what each column's
// content asks and the box's width, so the order the room is given out in is the table's own rather than the
// browser's table layout's.

import type { TableColumn } from "@nuxt/ui";

// The narrowest the title column stands while its words ask for more: 12rem.
export const TITLE_FLOOR_PX = 192;

// A settings table's column: the shared table's column, the title's marked as the flexible one, and a column whose
// cells vary in length carrying the ceiling it stands at where room is short.
export type SettingsColumn<T> = TableColumn<T> & { title?: true; ceiling?: number };

// What one column asks: the width its name and its widest cell take whole, and its ceiling or its being the title.
export interface ColumnAsk {
  id: string;
  content: number;
  ceiling?: number;
  title?: boolean;
}

/**
 * The width of every column for a box `box` pixels wide, in whole pixels, given out in one order: every content
 * column its content up to its ceiling and the title its floor, or its words where they ask less; then the title up
 * to its words; then the cut columns toward their content, evenly; and what is still left to the title. Where the
 * first share is wider than the box, the widths add up past it and the table scrolls.
 */
export function giveOutWidths(box: number, asks: readonly ColumnAsk[], floor = TITLE_FLOOR_PX): Record<string, number> {
  const widths = new Map<string, number>();

  for (const ask of asks) {
    const content = Math.max(0, Math.ceil(ask.content));

    widths.set(ask.id, ask.title ? Math.min(content, floor) : Math.min(content, ask.ceiling ?? Number.POSITIVE_INFINITY));
  }

  const used = () => [...widths.values()].reduce((sum, width) => sum + width, 0);
  let left = Math.floor(box) - used();
  const title = asks.find((ask) => ask.title);

  if (left > 0 && title !== undefined) {
    const grown = Math.min(left, Math.max(0, Math.ceil(title.content) - widths.get(title.id)!));

    widths.set(title.id, widths.get(title.id)! + grown);
    left -= grown;
  }

  // The cut columns grow together, each stopping at its content, until the room or their wants run out.
  let cut = asks.filter((ask) => !ask.title && widths.get(ask.id)! < Math.ceil(ask.content));

  while (left > 0 && cut.length > 0) {
    const share = Math.max(1, Math.floor(left / cut.length));

    for (const ask of cut) {
      if (left <= 0) break;

      const grown = Math.min(share, left, Math.ceil(ask.content) - widths.get(ask.id)!);

      widths.set(ask.id, widths.get(ask.id)! + grown);
      left -= grown;
    }

    cut = cut.filter((ask) => widths.get(ask.id)! < Math.ceil(ask.content));
  }

  if (left > 0 && title !== undefined) widths.set(title.id, widths.get(title.id)! + left);

  return Object.fromEntries(widths);
}
