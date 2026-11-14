import { countLocale } from "bmo-ui/app/domain/numbers";
import { searchHits, searchPhrase } from "bmo-ui/shared/search";

import type { ArchivedMessage, ExactMessageId } from "#shared/types";

// Finding a phrase in a room (docs/web.md, the room screen's find): the console's list search over what each loaded message
// shows — its words, its sender's name, its files' names — and the hits marked where they stand on the screen, inside
// the bubble as it is drawn, by the browser's own highlights so nothing of the drawn message changes.

// The highlights the room's stylesheet colours: every hit, and the hits of the message being shown.
export const FOUND = "room-found";
export const FOUND_CURRENT = "room-found-current";

/** What a message shows that a search reads. */
function shownTexts(message: ArchivedMessage): string[] {
  // What the bubble stands, which is what a reader can see to find: a voice note's words among them, read out of the
  // record and drawn under its player (docs/web.md, the room screen's sound messages).
  return [message.text, message.senderName, message.transcript ?? "", ...(message.attachments ?? []).map((file) => file.name)];
}

/** The messages holding the phrase, oldest first, by their numbers; none for an empty phrase. */
export function foundMessages(messages: readonly ArchivedMessage[], query: string): ExactMessageId[] {
  if (searchPhrase(query) === "") return [];

  const locale = countLocale();

  return messages.filter((message) => shownTexts(message).some((text) => searchHits(text, query, locale).length > 0)).map((message) => message.messageId);
}

/** The step a press takes from the hit shown: up to the one before it, down to the one after, held at the ends. */
export function steppedHit(count: number, at: number | null, by: -1 | 1): number | null {
  if (count === 0) return null;
  if (at === null) return count - 1;

  return Math.min(count - 1, Math.max(0, at + by));
}

// The browser's highlights, where it has them.
function registry(): HighlightRegistry | null {
  return typeof CSS === "undefined" || CSS.highlights === undefined || typeof Highlight === "undefined" ? null : CSS.highlights;
}

/** Every hit standing under `root` marked, the rows `current` names more strongly; nothing where the browser lacks highlights. */
export function markFound(root: ParentNode | null, query: string, current: (row: Element) => boolean): void {
  const held = registry();

  if (held === null) return;

  clearFound();

  if (root === null || searchPhrase(query) === "") return;

  const locale = countLocale();
  const all: Range[] = [];
  const shown: Range[] = [];

  for (const row of root.querySelectorAll("[data-message]")) {
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? "";

      for (const [from, to] of searchHits(text, query, locale)) {
        const range = document.createRange();

        range.setStart(node, from);
        range.setEnd(node, to);
        ranges.push(range);
      }
    }

    (current(row) ? shown : all).push(...ranges);
  }

  held.set(FOUND, new Highlight(...all));
  held.set(FOUND_CURRENT, new Highlight(...shown));
}

/** Every mark taken away. */
export function clearFound(): void {
  const held = registry();

  held?.delete(FOUND);
  held?.delete(FOUND_CURRENT);
}
