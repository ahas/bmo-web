import { Lexer } from "marked";

import type { Token, Tokens } from "marked";

// Where a line was raised from: the unfinished notes it takes up, as bmo-job's `todo --add --from-todo` names them in
// the item's label `from-todo` (bmo-job's `docs/cli.md`), and the strands a note is read as (docs/web.md, the TODO
// panel's section, on a note resolving on its own). The label's grammar is bmo-job's own: entries joined with commas,
// each a note's item, alone for the note whole or followed by a colon and the number of the one strand it takes up.

/** The label a line raised from notes names them in. */
export const FROM_TODO_LABEL = "from-todo";

/** One note a line takes up: its item, and the numbered strand of it, or null for the note whole. */
export interface RaisedSource {
  item: number;
  strand: number | null;
}

/** One numbered strand of a note: its number as the note writes it, and its first words. */
export interface NoteStrand {
  number: number;
  text: string;
}

/** How many characters of a strand's first line name it in a chooser: a strand's first line can run to a paragraph,
 * and a choice is read in one glance. */
export const STRAND_WORDS_LIMIT = 60;

/** The numbered strands of a note: the items of its top-level numbered lists, read as markdown, each named by its
 * first words. A note with none is one strand, and stands here as none. */
export function noteStrands(note: string): NoteStrand[] {
  return Lexer.lex(note)
    .filter((token: Token): token is Tokens.List => token.type === "list" && (token as Tokens.List).ordered)
    .flatMap((list) => {
      const first = typeof list.start === "number" ? list.start : 1;

      return list.items.map((item, at) => ({ number: first + at, text: firstWords(item.text.trim().split("\n")[0]!.trim()) }));
    });
}

// A line cut to its first words: within the limit, at the end of a word where one ends in its later half, and marked
// as cut.
function firstWords(line: string): string {
  if (line.length <= STRAND_WORDS_LIMIT) return line;

  const cut = line.slice(0, STRAND_WORDS_LIMIT);
  const space = cut.lastIndexOf(" ");

  return `${(space > STRAND_WORDS_LIMIT / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The label naming the notes a line takes up, each once and in the order given; a note taken whole names no strand of
 * it beside. */
export function fromTodoLabel(sources: readonly RaisedSource[]): string {
  const whole = new Set(sources.filter((source) => source.strand === null).map((source) => source.item));
  const entries = sources.flatMap((source) => {
    if (source.strand === null) return [String(source.item)];

    return whole.has(source.item) ? [] : [`${source.item}:${source.strand}`];
  });

  return [...new Set(entries)].join(",");
}

/** The notes a label names. An entry that is no item's number, or whose strand is no number, is passed over. */
export function sourcesOf(label: string | undefined): RaisedSource[] {
  return (label ?? "").split(",").flatMap((entry) => {
    const [item, strand, ...rest] = entry.trim().split(":");
    const id = Number(item);
    const number = strand === undefined ? null : Number(strand);

    if (rest.length > 0 || item === "" || !Number.isInteger(id) || id <= 0) return [];
    if (number !== null && (strand === "" || !Number.isInteger(number) || number <= 0)) return [];

    return [{ item: id, strand: number }];
  });
}

/** Whether the sources lines name take up a note whole: one names it whole, the note has no numbered strands, or every
 * numbered strand is named. */
export function takesUpWhole(strands: readonly NoteStrand[], named: readonly RaisedSource[]): boolean {
  if (strands.length === 0 || named.some((source) => source.strand === null)) return true;

  const taken = new Set(named.map((source) => source.strand));

  return strands.every((strand) => taken.has(strand.number));
}
