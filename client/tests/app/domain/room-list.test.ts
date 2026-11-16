import { expect, test } from "bun:test";

import { movesRoomList, unreadShown, withNewestReads } from "../../../apps/web/app/domain/room-list";

import type { ListedRoom, ReadPlace, RoomRead } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/room-list.test.ko.json";

// A room's count as the screen shows it, out of list reads and mark answers arriving in either
// order (docs/web.md, 「Sidebar」).

const at = (sentAt: number, order = 0): ReadPlace => ({ sentAt, order });
const room = (chatId: number, unread: number, readTo: ReadPlace | null): ListedRoom =>
  ({ chatId, title: `${KO.line_12}${chatId}`, messageCount: 9, lastMessageAt: 9, pinned: false, unread, firstUnread: unread > 0 ? "7" : null, readTo, writable: true });

test("a list read from before the mark landed does not raise the count the mark lowered", () => {
  const answered: Record<number, RoomRead> = { 1: { unread: 0, firstUnread: null, readTo: at(200, 5) } };

  expect(withNewestReads([room(1, 2, at(200, 4))], answered)[0]).toMatchObject({ unread: 0, firstUnread: null, readTo: at(200, 5) });
});

test("a list read from the mark's place or past it stands, so what lands after the mark counts", () => {
  const answered: Record<number, RoomRead> = { 1: { unread: 0, firstUnread: null, readTo: at(200, 5) } };

  expect(withNewestReads([room(1, 1, at(200, 5))], answered)[0]!.unread).toBe(1);
  expect(withNewestReads([room(1, 3, at(300))], answered)[0]!.unread).toBe(3);
});

test("a room no mark was answered for, and an answer naming no place, leave the list as it reads", () => {
  const answered: Record<number, RoomRead> = { 2: { unread: 0, firstUnread: null, readTo: null } };

  expect(withNewestReads([room(1, 2, at(100)), room(2, 4, null)], answered).map((one) => one.unread)).toEqual([2, 4]);
});

test("the room open and read at its end carries no count, and any other room keeps its own", () => {
  const counting = room(1, 2, at(100));

  expect(unreadShown(counting, { chatId: 1, atEnd: true })).toBe(0);
  expect(unreadShown(counting, { chatId: 1, atEnd: false })).toBe(2);
  expect(unreadShown(counting, { chatId: 2, atEnd: true })).toBe(2);
  expect(unreadShown(counting, null)).toBe(2);
});

// The administrator's stream carries every room, and only a message in a room his list holds reads it again
// (docs/web.md, 「Access」); a member's stream carries their own rooms alone, so every word of it does.
test("another account's message moves nothing of the administrator's list, and every word moves a member's", () => {
  const held = [{ chatId: 1 }];

  expect(movesRoomList({ type: "message", chatId: 1 }, held, true)).toBe(true);
  expect(movesRoomList({ type: "message", chatId: 2 }, held, true)).toBe(false);
  expect(movesRoomList({ type: "room-removed", chatId: 2 }, held, true)).toBe(true);
  expect(movesRoomList({ type: "message", chatId: 2 }, held, false)).toBe(true);
});
