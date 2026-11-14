import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";
import { scratchWebDatabase } from "../../support/web-database";

// How far an account has read a room: the marks are the console's own table, counted against a stand-in
// receiver's line. What is pinned here is that a room met for the first time is read as it stands, that what lands
// past the mark is counted from its first, that the account's own word reads the room up to it, that a room read to
// its last message counts nothing until another lands, and that a mark only moves forward. The line's ids run past
// 2^53, as a chat service may number its messages, and neighbours a JavaScript number would read as one id, so
// every mark and count here names a message by its exact id (docs/web.md, 「Unread messages」).

await scratchWebDatabase();

const OWN = 42;
const BASE = 3_973_025_898_369_060_100n;
// The exact id of the line's nth message.
const id = (nth: number): string => String(BASE + BigInt(nth));

type Said = { messageId: string; senderId: number | null; sentAt: number };

let line: Said[] = [{ messageId: id(1), senderId: 7, sentAt: 100_000 }];

const received = (one: Said) => ({
  id: rawNumber(one.messageId),
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
    const page = afterMark === null ? line.slice(-1) : line.filter((said) => BigInt(said.messageId) > BigInt(afterMark));

    return answer({ items: page.map(received), more: false });
  }

  const single = /^\/rooms\/-7\/messages\/(-?\d+)$/.exec(path);

  if (single !== null) {
    const found = line.find((said) => said.messageId === single[1]);

    return found === undefined ? answer({ code: "not-found", error: "no message" }, 404) : answer(received(found));
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const { markRead, roomLast, unreadCounts } = await import("../../../apps/web/server/utils/room-reads");

const signed = { name: "member-a", id: null, administrator: true };
// The room list names a room's last message by its second; the receiver's line and the marks keep milliseconds.
const room = () => [roomLast({ chatId: -7, lastMessageAt: Math.floor(line.at(-1)!.sentAt / 1000) })];
const counted = async () => (await unreadCounts(signed, [OWN], room(), 1_000)).get(-7);

describe("what a room holds unread", () => {
  test("a room met for the first time is read as it stands", async () => {
    expect(await counted()).toEqual({ count: 0, first: null, from: { sentAt: 100_000, order: 0 } });
  });

  test("what lands past the mark is counted from the first of it", async () => {
    line = [...line, { messageId: id(2), senderId: 7, sentAt: 110_000 }, { messageId: id(3), senderId: 8, sentAt: 120_000 }];

    expect(await counted()).toEqual({ count: 2, first: id(2), from: { sentAt: 100_000, order: 0 } });
  });

  test("the account's own word reads the room up to it", async () => {
    line = [...line, { messageId: id(4), senderId: OWN, sentAt: 130_000 }, { messageId: id(5), senderId: 7, sentAt: 140_000 }];

    expect(await counted()).toEqual({ count: 1, first: id(5), from: { sentAt: 130_000, order: 0 } });
  });

  test("a message sent in the same second as the place read to still counts", async () => {
    expect(roomLast({ chatId: -7, lastMessageAt: 140 })).toEqual({ chatId: -7, lastMessageMs: 140_999 });
  });

  test("a room read to its last message counts nothing, and a message landing after the mark counts again", async () => {
    expect(await markRead(signed, [OWN], -7, id(5), 1_000)).toEqual({ count: 0, first: null, from: { sentAt: 140_000, order: 0 } });
    expect(await counted()).toEqual({ count: 0, first: null, from: { sentAt: 140_000, order: 0 } });

    // Sent in the same second as the marked message, and one apart from it.
    line = [...line, { messageId: id(6), senderId: 7, sentAt: 140_000 }];

    expect(await counted()).toEqual({ count: 1, first: id(6), from: { sentAt: 140_000, order: 0 } });
  });

  test("a mark behind the account's place moves nothing", async () => {
    expect(await markRead(signed, [OWN], -7, id(2), 1_001)).toEqual({ count: 1, first: id(6), from: { sentAt: 140_000, order: 0 } });
  });
});
