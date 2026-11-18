import { PAGING } from "#shared/config";
import { exactMessageIdOf } from "#shared/message-ids";
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

/** The message a route's path names, by its exact id (ExactMessageId). */
export function requireMessageId(event: H3Event): ExactMessageId {
  return requireExactMessageId(getRouterParam(event, "messageId"));
}

/** A message's exact id a request hands over (ExactMessageId), as the digits BigInt writes; anything else is
 * refused. */
export function requireExactMessageId(value: unknown): ExactMessageId {
  const id = typeof value === "string" ? exactMessageIdOf(value) : null;

  if (id === null) throw fail(400, wording("room.error.bad_message_id"));

  return id;
}

/** A message a query names as a cursor by its exact id, or null where it names none. */
export function readMessageCursor(value: unknown): ExactMessageId | null {
  if (value === undefined || value === null || value === "") return null;

  const id = typeof value === "string" ? exactMessageIdOf(value) : null;

  if (id === null) throw fail(400, wording("common.error.bad_cursor"));

  return id;
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
export function replyToOf(value: unknown): ExactMessageId | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = exactMessageIdOf(value);

  if (id === null || id === "0") {
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

/** The verdicts a query names, a comma list of their numbers, at most a page of them; anything else is refused. */
export function requireJudgementIds(value: unknown): number[] {
  const ids = typeof value === "string" && value !== "" ? value.split(",").map(Number) : [];

  if (ids.length === 0 || ids.length > PAGING.maxSize || !ids.every((id) => Number.isSafeInteger(id))) {
    throw fail(400, wording("room.error.bad_judgement_ids"));
  }

  return ids;
}

/** The seconds a query names verdicts were written in, `from` to `to`, in unix seconds; anything else is refused. */
export function requireJudgementSpan(fromValue: unknown, toValue: unknown): { from: number; to: number } {
  const from = Number(fromValue);
  const to = Number(toValue);

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) {
    throw fail(400, wording("room.error.bad_judgement_span"));
  }

  return { from, to };
}

// A language tag as the gate's translator reads one: a primary subtag of letters, and any subtags after it.
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;

/** The language a query names a reader reads, as a language tag; anything else is refused. */
export function requireLanguage(value: unknown): string {
  if (typeof value !== "string" || !LANGUAGE_TAG.test(value)) throw fail(400, wording("room.error.bad_language"));

  return value;
}
