import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";
import { scratchWebDatabase } from "../../support/web-database";

// How far an account has read a room: the marks are the console's own table, counted against a stand-in
// receiver's line. What is pinned here is that a room met for the first time is read as it stands, that what lands
// past the mark is counted from its first, that the account's own word reads the room up to it, and that a mark
// only moves forward.

await scratchWebDatabase();

const OWN = 42;
let line: { messageId: number; senderId: number | null; sentAt: number }[] = [{ messageId: 1, senderId: 7, sentAt: 100_000 }];

const after = (id: number) => line.slice(line.findIndex((one) => one.messageId === id) + 1);

const received = (one: { messageId: number; senderId: number | null; sentAt: number }) => ({
  id: one.messageId,
  room: -7,
  senderId: one.senderId,
  senderName: one.senderId === null ? "" : `sender-${one.senderId}`,
  sentAt: one.sentAt,
  text: "",
  imagePath: null,
  replyToMessageId: null,
  answerSeconds: null,
  round: null,
  album: null,
  via: null,
  files: []
});

standIn("RECEIVER", (one) => {
  const url = new URL(one.path, "http://receiver");
  const path = url.pathname;

  if (path === "/rooms/-7/messages") {
    const afterMark = url.searchParams.get("after");

    return answer({ items: (afterMark === null ? line.slice(-1) : after(Number(afterMark))).map(received), more: false });
  }

  const single = /^\/rooms\/-7\/messages\/(-?\d+)$/.exec(path);

  if (single !== null) {
    const found = line.find((one) => one.messageId === Number(single[1]));

    return found === undefined ? answer({ code: "not-found", error: "no message" }, 404) : answer(received(found));
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const { markRead, roomLast, unreadCounts } = await import("../../../apps/web/server/utils/room-reads");

const signed = { name: "member-a", id: null, administrator: true };
// The room list names a room's last message by its second; the receiver's line and the marks keep milliseconds.
const room = () => [roomLast({ chatId: -7, lastMessageAt: Math.floor(line.at(-1)!.sentAt / 1000) })];

describe("what a room holds unread", () => {
  test("a room met for the first time is read as it stands", async () => {
    expect((await unreadCounts(signed, [OWN], room(), 1_000)).get(-7)).toEqual({ count: 0, first: null, from: { sentAt: 100_000, order: 0 } });
  });

  test("what lands past the mark is counted from the first of it", async () => {
    line = [...line, { messageId: 2, senderId: 7, sentAt: 110_000 }, { messageId: 3, senderId: 8, sentAt: 120_000 }];

    expect((await unreadCounts(signed, [OWN], room(), 1_000)).get(-7)).toEqual({ count: 2, first: 2, from: { sentAt: 100_000, order: 0 } });
  });

  test("the account's own word reads the room up to it", async () => {
    line = [...line, { messageId: 4, senderId: OWN, sentAt: 130_000 }, { messageId: 5, senderId: 7, sentAt: 140_000 }];

    expect((await unreadCounts(signed, [OWN], room(), 1_000)).get(-7)).toEqual({ count: 1, first: 5, from: { sentAt: 130_000, order: 0 } });
  });

  test("a message sent in the same second as the place read to still counts", async () => {
    expect(roomLast({ chatId: -7, lastMessageAt: 140 })).toEqual({ chatId: -7, lastMessageMs: 140_999 });
  });

  test("a room read up to a message counts only past it, and a mark behind it moves nothing", async () => {
    expect(await markRead(signed, [OWN], -7, 5, 1_000)).toEqual({ count: 0, first: null, from: { sentAt: 140_000, order: 0 } });
    expect(await markRead(signed, [OWN], -7, 2, 1_001)).toEqual({ count: 0, first: null, from: { sentAt: 140_000, order: 0 } });
  });
});
