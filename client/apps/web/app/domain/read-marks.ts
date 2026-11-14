import { useMarkRoomRead, useRoomReading } from "./room-list";

import type { ExactMessageId } from "#shared/types";
import type { Ref } from "vue";

// How a room screen tells the server how far its reader has read (docs/web.md, 「Sidebar」): a
// message is read once its row has stood in the room's view with its foot in sight, in a tab on the
// screen. Reading back into older messages marks nothing newer than what is in view. A message is named by its
// exact id throughout, so a room numbered past 2^53 is marked as any other (docs/web.md, 「A message's id」).

// How often the marks of a scroll go, the furthest of them each time.
const MARK_SETTLE_MS = 300;

// How close to the end a reader stands and still reads as standing there.
const AT_END_PX = 2;

// The rows a feed draws for its archived messages carry the message's exact id in this attribute.
const MESSAGE_ID = "data-message-id";
const MESSAGE_ROW = `[${MESSAGE_ID}]`;

/**
 * The message the reader has read up to, given the last message row seen and which messages stand
 * as rows of their own: that row's message, carried over every message after it that stands as no
 * row — the voice that belongs to a line, the other pictures of an album — up to the next row.
 */
export function readThrough(
  messages: readonly { messageId: ExactMessageId }[],
  rows: ReadonlySet<ExactMessageId>,
  seen: ExactMessageId
): ExactMessageId | null {
  let at = messages.findIndex((message) => message.messageId === seen);

  if (at === -1) return null;

  while (at + 1 < messages.length && !rows.has(messages[at + 1]!.messageId)) at += 1;

  return messages[at]!.messageId;
}

/** The last message row whose foot stands in the view, or null where none does. */
export function lastRowInView(viewport: HTMLElement): ExactMessageId | null {
  const view = viewport.getBoundingClientRect();
  const rows = viewport.querySelectorAll<HTMLElement>(MESSAGE_ROW);

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const box = rows[index]!.getBoundingClientRect();

    if (box.bottom <= view.bottom + 1 && box.bottom > view.top) return rows[index]!.getAttribute(MESSAGE_ID);
  }

  return null;
}

export interface ReadMarkSource {
  chatId: number;
  viewport: () => HTMLElement | null;
  // The messages the feed holds, in the room's order.
  messages: Ref<readonly { messageId: ExactMessageId }[]>;
  // The messages that stand as rows of their own.
  rows: () => ReadonlySet<ExactMessageId>;
  // Whether the room goes on past the newest message held.
  newer: Ref<boolean>;
  // Whether the room's follower says the reader stands away from its end; a glide of its own carrying
  // the reader down to what landed never counts.
  away: Ref<boolean>;
  // Whether the room has taken its opening place: nothing is marked while it is still moving there.
  settled: Ref<boolean>;
}

/**
 * Watches a room's view and marks the room read as its messages come into sight, and says to the
 * sidebar whether the room is being read at its end. Taken in the room screen's setup.
 */
export function useReadMarks(source: ReadMarkSource): void {
  if (import.meta.server) return;

  const mark = useMarkRoomRead();
  const reading = useRoomReading();
  // The furthest message sent, by its place in the feed, so a scroll back up sends nothing.
  let sent: ExactMessageId | null = null;
  // Whether the reader stands at the room's end, whether or not the tab is on the screen.
  let atEnd = false;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  let frame: number | null = null;

  function onScreen(): boolean {
    return document.visibilityState === "visible";
  }

  function check(): void {
    frame = null;

    const viewport = source.viewport();

    if (viewport === null) return;

    // The reader comes to the end where the view reaches it, and stays there while the follower glides
    // the view down to what landed, until the follower says they stand away. A room still taking its
    // opening place stands nowhere yet, though its empty feed is at its end: read as standing there,
    // its count would go, come back as the feed fills short of the end, and go again as a mark lands.
    const reached = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= AT_END_PX;

    atEnd = source.settled.value && !source.newer.value && (reached || (atEnd && !source.away.value));

    const now = { chatId: source.chatId, atEnd: atEnd && onScreen() };

    // Said only when it changes, since the sidebar is drawn again on every word of it.
    if (reading.value?.chatId !== now.chatId || reading.value.atEnd !== now.atEnd) reading.value = now;

    if (!onScreen() || !source.settled.value) return;

    const seen = lastRowInView(viewport);
    const through = seen === null ? null : readThrough(source.messages.value, source.rows(), seen);

    if (through === null || !isAhead(through)) return;

    sent = through;

    // A mark already waiting takes the furthest place when it goes; a scroll that never stops still
    // marks on this beat.
    waiting ??= setTimeout(() => {
      waiting = null;

      send();
    }, MARK_SETTLE_MS);
  }

  function send(): void {
    if (sent === null) return;

    void mark(source.chatId, sent).catch(() => {
      // A mark that did not land is made again by the next look; the count stands as it was.
      sent = null;
    });
  }

  function isAhead(messageId: ExactMessageId): boolean {
    if (sent === null) return true;

    const messages = source.messages.value;
    const was = messages.findIndex((message) => message.messageId === sent);

    // A feed taken elsewhere no longer holds the last one sent; the server keeps the mark from moving back.
    return was === -1 || messages.findIndex((message) => message.messageId === messageId) > was;
  }

  function look(): void {
    frame ??= requestAnimationFrame(check);
  }

  watch([() => source.messages.value, source.settled, source.away], () => void nextTick(look), { flush: "post" });

  onMounted(() => {
    source.viewport()?.addEventListener("scroll", look, { passive: true });
    document.addEventListener("visibilitychange", look);
    window.addEventListener("resize", look);
    look();
  });

  onBeforeUnmount(() => {
    source.viewport()?.removeEventListener("scroll", look);
    document.removeEventListener("visibilitychange", look);
    window.removeEventListener("resize", look);
    if (frame !== null) cancelAnimationFrame(frame);

    // A mark still waiting goes as the room is left, so what was seen on the way out counts.
    if (waiting !== null) {
      clearTimeout(waiting);
      send();
    }

    if (reading.value?.chatId === source.chatId) reading.value = null;
  });
}
