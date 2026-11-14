import { userOf } from "./account-service";

import { useWebSql } from "./db";
import { exactMessage, exactMessages } from "./receiver";

import type { SignedIn } from "./accounts";
import type { ExactMessageId, ReadPlace } from "#shared/types";

// How far each account has read each room on the console, and how many messages stand past it (docs/web.md,
// 「Sidebar」). The marks are the console's own table, `web_room_reads`; the messages are the receiver's, walked
// past the marked message with its `messages/after` route, which walks a room's line by when each message was
// sent and the order it was taken in, so the two numberings a room carries never have to be compared. A mark
// only ever moves forward.
//
// What counts as read is the later of two places: the console's own mark, and the account's own last message in
// the room from any sender linked to it. A provider does not tell the receiver what a person has read, so reading
// a room elsewhere is unknown here; writing in it is known, and whoever wrote has read the room up to there.
//
// A place is when its message was sent; the receiver hands no order of its own between messages sent in one
// second, so a place's order is nought and the marked message itself says where in that second it stands.
//
// A message is named by its exact id throughout (ExactMessageId): the mark keeps it, the walk starts past it and a
// screen hands it back, so a room whose chat service numbers its messages past 2^53 clears like any other.

// How many messages past a mark are walked to count them; a room further behind than this counts this many.
const COUNTED = 500;

/** A room as the count reads it: its number and when its last message was sent, in the receiver's epoch
 * milliseconds — the unit a mark's place is kept in — or the last millisecond of the second a room list names. */
export interface RoomLast {
  chatId: number;
  lastMessageMs: number | null;
}

/** A room as the room list names it, its last message's second read as the last millisecond of that second, so a
 * message sent later in the same second as the place read to is never taken as read. */
export function roomLast(room: { chatId: number; lastMessageAt: number | null }): RoomLast {
  return { chatId: room.chatId, lastMessageMs: room.lastMessageAt === null ? null : room.lastMessageAt * 1000 + 999 };
}

interface Mark {
  messageId: ExactMessageId | null;
  sentAt: number;
}

interface Received {
  messageId: ExactMessageId;
  senderId: number | null;
  sentAt: number;
}

/** The senders that are the account's own: the owner's own identity for the administrator, and every identity linked to the user. */
export async function ownSenders(signed: SignedIn, owner: number | null): Promise<number[]> {
  const own = new Set<number>();

  if (signed.administrator && owner !== null) own.add(owner);

  if (signed.id !== null) {
    for (const sender of (await userOf(signed.id))?.senders ?? []) own.add(Number(sender));
  }

  return [...own];
}

/**
 * What a room holds unread for an account: how many, the first of them, and the place read to that they are
 * counted from, by which a screen tells an older count from a newer one.
 */
export interface Unread {
  count: number;
  first: ExactMessageId | null;
  from: ReadPlace | null;
}

function placeOf(sentAt: number): ReadPlace {
  return { sentAt, order: 0 };
}

// The room's newest message, the place a room is read up to when the account first meets it.
async function newest(chatId: number): Promise<Received | null> {
  const { items } = await exactMessages(chatId, { limit: 1 });
  const last = items.at(-1);

  return last === undefined ? null : { messageId: last.id, senderId: last.senderId, sentAt: last.sentAt };
}

async function marksOf(signed: SignedIn): Promise<Map<number, Mark>> {
  const rows = (await useWebSql().all(
    'SELECT chat_id AS "chatId", message_id::text AS "messageId", sent_at AS "sentAt" FROM web_room_reads WHERE user_name = $1',
    signed.name
  )) as { chatId: number; messageId: ExactMessageId | null; sentAt: number }[];

  return new Map(rows.map((row) => [Number(row.chatId), { messageId: row.messageId, sentAt: Number(row.sentAt) }]));
}

async function writeMark(signed: SignedIn, chatId: number, mark: Mark, now: number): Promise<void> {
  await useWebSql().run(
    `INSERT INTO web_room_reads (user_name, chat_id, message_id, sent_at, row_order, created_at, read_at, user_id) VALUES ($1, $2, CAST($3 AS bigint), $4, 0, $5, $5, $6)
     ON CONFLICT (user_name, chat_id) DO UPDATE SET message_id = excluded.message_id, sent_at = excluded.sent_at, read_at = excluded.read_at,
       user_id = excluded.user_id
     WHERE excluded.sent_at >= web_room_reads.sent_at`,
    signed.name,
    chatId,
    mark.messageId,
    mark.sentAt,
    now,
    signed.id
  );
}

// What stands past a mark: every message after the marked one, from after the account's own last word among them.
async function unreadAfter(chatId: number, mark: Mark, own: ReadonlySet<number>): Promise<Unread> {
  // A room met while it held nothing is read up to a moment rather than a message, so what came after that moment
  // is what stands past it.
  const query = mark.messageId === null ? { limit: COUNTED } : { after: mark.messageId, limit: COUNTED };
  const { items } = await exactMessages(chatId, query);
  const messages: Received[] = items
    .map((message) => ({ messageId: message.id, senderId: message.senderId, sentAt: message.sentAt }))
    .filter((message) => mark.messageId !== null || message.sentAt > mark.sentAt);
  const lastOwn = messages.findLastIndex((message) => message.senderId !== null && own.has(message.senderId));
  const past = messages.slice(lastOwn + 1);
  const from = lastOwn === -1 ? placeOf(mark.sentAt) : placeOf(messages[lastOwn]!.sentAt);

  return { count: past.length, first: past[0]?.messageId ?? null, from };
}

/**
 * How many messages of each room the account has not read, and the first of them. A room the account meets for
 * the first time is read as it stands, so its count starts from nothing rather than from the room's whole
 * history.
 */
export async function unreadCounts(signed: SignedIn, own: readonly number[], rooms: readonly RoomLast[], now: number): Promise<Map<number, Unread>> {
  const marks = await marksOf(signed);
  const ours = new Set(own);

  // The rooms are read side by side, each with at most one read of the receiver: its newest message where the
  // account first meets it, or what stands past its place where its last word is newer than that place.
  const read = await Promise.all(rooms.map(async ({ chatId, lastMessageMs }): Promise<[number, Unread]> => {
    let mark = marks.get(chatId);

    if (mark === undefined) {
      const last = await newest(chatId).catch(() => null);

      // A room with no message yet is read up to now, in the milliseconds a message's place is kept in.
      mark = { messageId: last?.messageId ?? null, sentAt: last?.sentAt ?? now * 1000 };
      await writeMark(signed, chatId, mark, now);
    }

    const held = mark;

    // A room whose last word is older than the place read to has nothing past it, and is not walked.
    return [
      chatId,
      lastMessageMs === null || lastMessageMs < held.sentAt
        ? { count: 0, first: null, from: placeOf(held.sentAt) }
        : await unreadAfter(chatId, held, ours).catch(() => ({ count: 0, first: null, from: placeOf(held.sentAt) }))
    ];
  }));

  return new Map(read);
}

/**
 * The room read up to one of its messages, and what stands unread past the account's place now. A message the
 * room does not hold moves nothing; a place behind the mark leaves the mark where it is.
 */
export async function markRead(signed: SignedIn, own: readonly number[], chatId: number, messageId: ExactMessageId, now: number): Promise<Unread> {
  const message = await exactMessage(chatId, messageId);

  await writeMark(signed, chatId, { messageId: message.id, sentAt: message.sentAt }, now);

  const last = await newest(chatId);

  return (await unreadCounts(signed, own, [{ chatId, lastMessageMs: last?.sentAt ?? null }], now)).get(chatId) ?? { count: 0, first: null, from: null };
}
