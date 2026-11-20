import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { RoomHoldingPage } from "../../../apps/web/shared/types";

// A room's messages holding one kind, as the room information's tabs read them (docs/web.md, the room screen's room
// information; docs/boundary.md, 「Gaps the console meets」): the kind and the cursor go to the receiver's messages
// route beside the query its client names, the cursor by the digits it was given, and a kind the screen never asks for
// is refused before the receiver is asked.

// Two rows a JavaScript number reads as one.
const HIGH = ["3973025898369060353", "3973025898369060354"];

const row = (id: string, sentAt: number) => ({
  id: rawNumber(id),
  room: -12,
  senderId: 11,
  senderName: "person-a",
  sentAt,
  text: "see https://example.com/page",
  imagePath: null,
  replyToMessageId: null,
  answerSeconds: null,
  round: null,
  album: null,
  via: null,
  files: []
});

const receiver = standIn("RECEIVER", (one) => {
  const url = new URL(one.path, "http://receiver");

  if (url.pathname === "/rooms/-12/messages") return answer({ items: [row(HIGH[0]!, 1_790_000_000_000), row(HIGH[1]!, 1_790_000_060_000)], more: true });
  if (url.pathname === "/rooms/-12/answerers") return answer({ default: "", voice: "", items: [], more: false });

  return answer({ code: "not-found", error: "Not served here." }, 404);
});

// The administrator reads every room, so whether a room may be read asks nothing here.
const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireReadableRoom", "readableRooms"]);
globals.requireReadableRoom = async () => undefined;
globals.readableRooms = async () => "all";

const holding = await routeOf<RoomHoldingPage>("../../apps/web/server/api/rooms/[chatId]/holding.get");

// What the route asked the receiver's messages route, each as the query it wrote.
function messagesAsked(): string[] {
  return receiver.asked
    .map((one) => new URL(one.path, "http://receiver"))
    .filter((url) => url.pathname === "/rooms/-12/messages")
    .map((url) => `${url.pathname}${url.search}`);
}

describe("a room's messages holding a kind", () => {
  test("asks the receiver for that kind before the cursor's own digits, and answers the page as it stands", async () => {
    receiver.asked.length = 0;

    const read = await asked(holding, { params: { chatId: "-12" }, query: { kind: "link", before: HIGH[1], limit: "30" } });

    expect(messagesAsked()).toEqual([`/rooms/-12/messages?limit=30&holding=link&before=${HIGH[1]}`]);
    expect(read.answer?.hasMore).toBe(true);
    expect(read.answer?.messages.map((message) => String(message.messageId))).toEqual(HIGH);
  });

  test("refuses a kind the room information never asks for, and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const kind of [undefined, "", "photos", "MEDIA"]) {
      expect(await asked(holding, { params: { chatId: "-12" }, query: kind === undefined ? {} : { kind } })).toMatchObject({ status: 400 });
    }

    expect(messagesAsked()).toEqual([]);
  });
});
