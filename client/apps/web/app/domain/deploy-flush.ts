import { countText } from "./numbers";

// The minutes box of the administration screen's flush minutes row (docs/web.md, 「Administration」, the providers tab):
// what a figure written in it asks of the agency.

/** A figure written: minutes for the agency to take or refuse, null to return to its own, or none to send. */
export type WrittenMinutes = { readable: true; minutes: number | null } | { readable: false };

// The thousands marks the box shows and the spaces a reader leaves are no part of the figure.
const SEPARATORS = /[,\s]/g;

/** What the words in the box ask: an emptied box returns to the agency's own, a figure is sent as written. */
export function minutesWritten(words: string): WrittenMinutes {
  const figure = words.replace(SEPARATORS, "");

  if (figure === "") return { readable: true, minutes: null };

  const minutes = Number(figure);

  return Number.isFinite(minutes) ? { readable: true, minutes } : { readable: false };
}

/** The box's words for the minutes in force, with thousands marks, or empty where the agency answers none. */
export function minutesWords(minutes: number | null): string {
  return minutes === null ? "" : countText(minutes);
}
