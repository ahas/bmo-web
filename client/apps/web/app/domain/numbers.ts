import type { Translate } from "#shared/wording";

// How a number reads on this console when it is saying how many or how much. Six digits in a row
// is a thing to count rather than read — 116002 has to be walked with a finger to learn whether it
// is a hundred thousand or a million — and the thousands mark is what turns it back into a figure
// read at a glance. Every count of rows the archive holds, every length, every size and every
// tally of tokens goes through here.
//
// A number that names something never does. A message's number, an item's number, a chat's, a
// port, a year, the nth attempt, the nth option: a mark in those is not decoration, it makes the
// value wrong — «item #1,203» is not the item they asked for, and a reader who copies it out has
// copied out something that is not a number any more.
//
// The locale is written down rather than left to the machine. Called with nothing, the browser
// answers in whatever the reader's system says and the server answers in whatever the process
// says, and the two are not obliged to agree — a figure the server drew one way and the browser
// redrew another is a mismatch, and the framework answers a mismatch by throwing that part of the
// page away and drawing it again from nothing.
export const COUNT_LOCALE = "ko-KR";

export function countText(value: number): string {
  return value.toLocaleString(COUNT_LOCALE);
}

// A sentence of the language pack with counts in it that change while it is read, handed over as
// the sentence and its counts rather than as words, so each count can turn on its own in its place
// while the words round it stand still (docs/web.md, 「Motion」).
export interface FigureLine {
  keypath: string;
  figures: Record<string, number>;
}

// A count standing as a badge beside a label — a room's unread messages, a tab's rows — wears one small
// pill everywhere (docs/web.md, 「Count badges」): the caption size in normal weight and tabular figures
// on a line no taller than the label's, a tint of its colour rather than the colour filled solid,
// rounded whole. The colour is the place's own to say. Written out class and all, since the
// stylesheet is built from the words in this file.
export const COUNT_BADGE = { size: "sm", variant: "soft", class: "py-0 min-w-5 justify-center rounded-full font-normal tabular-nums" } as const;

// A figure as places that turn on their own: each character keyed by where it stands counted from
// the right, so the ones stay over the ones as the figure grows or shrinks a digit, and a place whose
// character is the same before and after is the same place holding the same character.
export function figurePlaces(text: string): { at: number; mark: string }[] {
  const marks = [...text];

  return marks.map((mark, index) => ({ at: marks.length - 1 - index, mark }));
}

// Which way a figure's changed characters turn: up where it grew, down where it shrank.
export function turnOf(now: number, before: number): "up" | "down" {
  return now < before ? "down" : "up";
}

// How far a piece of work with a known end has come: done over total and the share, with no words
// around it. The share is floored, so 100% stands only once everything is done.
export function progressText(done: number, total: number): string {
  const share = total <= 0 ? 0 : Math.floor((Math.min(done, total) / total) * 100);

  return `${countText(done)}/${countText(total)} ${share}%`;
}

/** A length of time in seconds to one decimal, as the verdicts, the draft rounds and the calls say it. */
export function secondsText(t: Translate, ms: number): string {
  return t("common.label.seconds", { n: (ms / 1000).toLocaleString(COUNT_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
}
