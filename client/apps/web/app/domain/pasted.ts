import { PASTE_ENTRY_CHARS } from "#shared/config";

import type { Translate } from "#shared/wording";

// A long paste held beside the prompt until it is sent. It is text handed over, not a file: a
// room's session reads a file only by its name, so the words go as words. In the box it stands as
// its mark, where the caret was when it was pasted, and the send puts the words back in that place.
export interface PastedText {
  key: string;
  text: string;
  mark: string;
}

// How much of a paste's first line its entry shows.
const HEAD_CHARS = 40;

// Whether a paste is long enough to stand as a mark instead of spilling into the box.
export function isPasteEntry(text: string): boolean {
  return text.length >= PASTE_ENTRY_CHARS;
}

// A new paste, numbered with the lowest number no paste held beside the same box carries — a paste
// whose mark was deleted still holds its number until the message goes, so an undo that puts the
// mark back finds its own words.
export function pastedOf(t: Translate, text: string, held: readonly PastedText[] = []): PastedText {
  const taken = new Set(held.map((entry) => entry.key));
  let number = 1;

  while (taken.has(`paste${number}`)) {
    number += 1;
  }

  // The mark stands in the typed text and in the kept draft, and is found there again by what it says: the paste's
  // name and its length in the reader's language, in brackets.
  const { name, size } = pastedLabel(t, { key: `paste${number}`, text, mark: "" });

  return { key: `paste${number}`, text, mark: `[${name} · ${size}]` };
}

// What an entry says about its paste: the name its mark carries, the head of its first line with
// words in it, and how long the whole is, in the way this console writes a count.
export function pastedLabel(t: Translate, pasted: PastedText): { name: string; head: string; size: string } {
  const line = pasted.text.split("\n").map((part) => part.trim()).find((part) => part !== "") ?? "";
  const head = line.length > HEAD_CHARS ? `${line.slice(0, HEAD_CHARS)}…` : line;

  return {
    name: t("room.label.paste_name", { n: pasted.key.slice("paste".length) }),
    head,
    size: t("room.label.paste_size", { n: pasted.text.length.toLocaleString("ko-KR") })
  };
}

// The pastes whose mark still stands in the box. One whose mark was deleted is out of the message,
// and comes back with the mark if an undo puts it back.
export function standingPastes(typed: string, pasted: readonly PastedText[]): PastedText[] {
  return pasted.filter((entry) => typed.includes(entry.mark));
}

// The box with one paste's mark taken out, which is what removing its entry does.
export function withoutMark(typed: string, entry: PastedText): string {
  return typed.split(entry.mark).join("");
}

// The one message a press of send makes of the box: every mark replaced by the words it stands
// for, in the place it stands. A mark with no paste behind it is left as the text it is.
export function composedText(typed: string, pasted: readonly PastedText[]): string {
  let text = typed;

  for (const entry of pasted) {
    text = text.split(entry.mark).join(entry.text);
  }

  return text.trim();
}

// A paste as stored with the draft: anything else read back is dropped.
export function readPasted(raw: unknown): PastedText[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (entry): entry is PastedText =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as PastedText).key === "string" &&
      typeof (entry as PastedText).text === "string" &&
      typeof (entry as PastedText).mark === "string"
  );
}
