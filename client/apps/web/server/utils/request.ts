import { PAGING } from "#shared/config";
import { wording } from "#shared/wording";

import type { ExactMessageId } from "#shared/types";
import type { H3Event } from "h3";

export function requireChatId(event: H3Event): number {
  const raw = getRouterParam(event, "chatId") ?? "";
  const chatId = Number(raw);

  if (!Number.isSafeInteger(chatId)) {
    throw fail(400, wording("room.error.bad_chat_id"));
  }

  return chatId;
}

export function requireMessageId(event: H3Event): number {
  const messageId = Number(getRouterParam(event, "messageId") ?? "");

  if (!Number.isSafeInteger(messageId)) {
    throw fail(400, wording("room.error.bad_message_id"));
  }

  return messageId;
}

// The bounds of the signed 64-bit integer the receiver numbers a message with.
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** A message's exact id a body hands back (ExactMessageId): the decimal digits of a signed 64-bit integer, written
 * the one way BigInt writes them; anything else is refused. */
export function requireExactMessageId(value: unknown): ExactMessageId {
  const id = typeof value === "string" && /^-?\d{1,19}$/.test(value) ? BigInt(value) : null;

  if (id === null || id < INT64_MIN || id > INT64_MAX || String(id) !== value) {
    throw fail(400, wording("room.error.bad_message_id"));
  }

  return value;
}

export function requireTodoId(event: H3Event): number {
  const raw = getRouterParam(event, "id") ?? "";
  const id = Number(raw);

  if (!Number.isSafeInteger(id)) {
    throw fail(400, wording("todo.error.bad_item_id"));
  }

  return id;
}

// The clock every road reads, in the unit this console stores: unix seconds. A road that took
// milliseconds here would write a link ending a thousand times further off than the span it was
// given.
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// A cursor is the id of the row the caller already has; the page ends just before it.
export function readCursor(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const cursor = Number(value);

  if (!Number.isSafeInteger(cursor)) {
    throw fail(400, wording("common.error.bad_cursor"));
  }

  return cursor;
}

// A moment a link names, in the unix seconds this console keeps. A value that is no moment reads as none rather than
// failing the page, since a moment left out of a log opens its newest page and a reader is served either way.
export function readMoment(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const at = Number(value);

  return Number.isSafeInteger(at) && at > 0 ? at : null;
}

export function readLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return PAGING.defaultSize;
  }

  const limit = Number(value);

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw fail(400, wording("common.error.bad_limit"));
  }

  return Math.min(limit, PAGING.maxSize);
}

// The message a send answers, as a body names it: a message number, or nothing. Anything else is a
// request that was never going to be a reply.
export function replyToOf(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(id) || id === 0) {
    throw fail(400, wording("room.error.bad_reply_id"));
  }

  return id;
}

/** The briefing an address names, refused where it names none. */
export function requireBriefingId(event: H3Event): number {
  const id = Number(getRouterParam(event, "id") ?? "");

  if (!Number.isSafeInteger(id) || id <= 0) throw fail(400, wording("briefing.error.bad_id"));

  return id;
}
