import { joinURL, withLeadingSlash, withoutBase, withTrailingSlash } from "ufo";

import { exactMessageIdOf } from "./message-ids";

import type { ExactMessageId } from "./types";

// Where a notification goes when it is pressed. The server writes these into a push and the
// browser opens them, so both sides read the one set of rules rather than each spelling out
// paths of its own.
//
// The console lives under one base path, the one its configuration names as `app.baseURL`
// (docs/web.md, 「Where it opens」), in the browser's address and in the service worker's scope
// alike. Every address below is built under the base its caller reads from that configuration, so
// none of them names a base of its own.

// The base as the manifest and a service worker's scope write it: beginning and ending with a slash.
export function consoleBase(baseURL: string): string {
  return withTrailingSlash(withLeadingSlash(baseURL));
}

// An address the browser opened, as a route inside the app: the router already works below the
// base, so the base is taken off. An address outside the base is handed on as it is.
export function routeOf(baseURL: string, address: string): string {
  return withoutBase(address, consoleBase(baseURL));
}

// The owner's room, which is where the queue's panel stands. A console that does not know which
// chat is theirs opens the home page instead — every room is one press from there, and a guessed
// number would open somebody else's room.
export function ownerRoomPath(baseURL: string, ownerChatId: number | null): string {
  return ownerChatId === null ? consoleBase(baseURL) : roomPath(baseURL, ownerChatId);
}

// One room's screen.
export function roomPath(baseURL: string, chatId: number): string {
  return joinURL(consoleBase(baseURL), roomRoute(chatId));
}

// One item of the queue, with the panel opened on it. The panel reads the number off the address
// and opens that row, so a notification about a question or a report lands on the thing it is
// about rather than on a list to search through.
export function todoPath(baseURL: string, ownerChatId: number | null, todoId: number): string {
  return `${ownerRoomPath(baseURL, ownerChatId)}?todo=${todoId}`;
}

// The item a path names, for the panel reading its own address back. Anything that is not a
// whole positive number names no item.
export function todoOfQuery(value: unknown): number | null {
  return positiveQueryId(value);
}

// Query values are decimal text, not the permissive numeric prefixes accepted by parseInt.
function positiveQueryId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

// One message in a room. The room reads the number off the address and carries the screen to
// that row, which is how a notification or the playing bar sends them back to where a thing was
// said rather than to the foot of the conversation.
export function messagePath(baseURL: string, chatId: number, messageId: ExactMessageId): string {
  return `${roomPath(baseURL, chatId)}?at=${messageId}`;
}

// The same room as a route inside the app rather than as an address. The router already works
// below the console's own base, so handing it a path that carries the base puts it on twice and
// the screen lands nowhere. Anything outside the app — a notification the browser opens — wants
// the full address instead, which is what the two above are for.
export function roomRoute(chatId: number): string {
  return `/rooms/${chatId}`;
}

// One message as a route inside the app: the room's own route with the message named on it, for
// a screen sending a reader to where something was posted.
export function messageRoute(chatId: number, messageId: ExactMessageId): string {
  return `${roomRoute(chatId)}?at=${messageId}`;
}

// The message an address names by its exact id, for a room reading its own address back. A room numbers its
// messages from both ends — Telegram's above zero, the archive's own below it — so either is one.
export function messageOfQuery(value: unknown): ExactMessageId | null {
  const id = typeof value === "string" ? exactMessageIdOf(value) : null;

  return id === "0" ? null : id;
}
