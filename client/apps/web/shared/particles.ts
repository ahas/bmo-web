import type { Translate } from "./wording";

// A particle that changes with the sound before it, joined to a name that comes from another unit, so no key of the
// pack can carry the particle itself and the pack takes the joined name as its {subject} mark. The name joined to
// each form is a key of the pack, one for a name whose last sound closes, one for one that is open and one for one
// whose sound is not read, so a language that joins no particle to a name says the name alone in all three; what is
// read here is only which form the last sound asks for: the final a syllable closes on, read off its place in the
// syllable block, or the final of a figure's reading.

// Where the syllable block starts, and how many syllables it holds; each syllable's place in it carries its final.
const SYLLABLES_FROM = 0xac00;
const SYLLABLES = 11_172;
const FINALS = 28;

// The finals a figure's reading closes on, by the figure: 0, 1, 3, 6, 7 and 8 close, the rest are open.
const FIGURE_FINALS = new Map([["0", 21], ["1", 8], ["3", 16], ["6", 1], ["7", 8], ["8", 8]]);

// Closing brackets and quotes a word may end on, which the particle after them reads past.
const CLOSING_MARKS = /[)\]}」』"'”’》〉]+$/;

/** The final a syllable or a figure closes on, 0 for none; null for any other character, whose sound is not read. */
export function finalOf(character: string): number | null {
  const place = character.charCodeAt(0) - SYLLABLES_FROM;

  if (character.length === 1 && place >= 0 && place < SYLLABLES) {
    return place % FINALS;
  }

  return /^[0-9]$/.test(character) ? (FIGURE_FINALS.get(character) ?? 0) : null;
}

/**
 * A name joined to the subject particle its last sound asks for, read past a closing bracket or quote. A name that
 * ends in anything else gives no sound to read and takes both forms.
 */
export function subjectOf(t: Translate, name: string): string {
  const final = finalOf(name.replace(CLOSING_MARKS, "").slice(-1));

  if (final === null) {
    return t("common.label.subject_unread", { name });
  }

  return final === 0 ? t("common.label.subject_open", { name }) : t("common.label.subject_closed", { name });
}
