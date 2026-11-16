import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { ForwardedMessage, MessageAct, RoomPins, SentMessage, StickerSet } from "../../../apps/web/shared/types";

// The acts a signed-in person does to a room's messages through this app's server (the receiver's `docs/api.md`,
// 「Messages」): a reaction of their own, a pin, an edit of their own message and a delete of it, and the room's pins
// and stickers read beside the room. Each act names the person to the receiver by their owner key and role, answers the
// message it stood on by its number, and says a refusal by the pack's sentence for its code.

const MESSAGE = {
  id: 21,
  room: -7,
  senderId: 33,
  senderName: "person-a",
  sentAt: 1_790_000_000_000,
  text: "words",
  imagePath: null,
  replyToMessageId: null,
  answerSeconds: null,
  round: null,
  album: null,
  via: null,
  agentName: null,
  voice: null,
  files: [],
  kind: null,
  editedAt: null,
  deletedAt: null,
  pinnedAt: 1_790_000_030_000,
  reactions: [{ emoji: "👍", by: "33" }],
  forwardedFrom: null
};

// A message of a chat service that numbers its messages past 2^53, and the copy a forward of it stands as: neighbours
// a JavaScript number reads as one (docs/web.md, 「A message's id」).
const HIGH = "3973025898369060353";
const HIGH_COPY = "3973025898369060354";

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === `/rooms/-7/messages/${HIGH}/forwards`) return answer({ room: one.body?.to, id: rawNumber(HIGH_COPY) }, 201);
  if (path.startsWith(`/rooms/-7/messages/${HIGH}`)) return answer({ ...MESSAGE, id: rawNumber(HIGH) });

  if (/^\/rooms\/-7\/messages\/-404\//.test(path) || path === "/rooms/-7/messages/-404") {
    return answer({ code: "message-unknown", error: "The record holds no such message." }, 404);
  }

  if (path === "/rooms/-7/messages/-1") {
    return answer({ code: "message-forbidden", error: "Another person's message." }, 403);
  }

  if (path === "/rooms/-7/messages/21/forwards") {
    return answer({ room: one.body?.to, id: 77 }, 201);
  }

  if (path === "/rooms/-7/pins") {
    return answer({ items: [MESSAGE] });
  }

  if (path === "/stickers") {
    return answer({ items: [{ emoji: "👍" }, { emoji: "🎉" }] });
  }

  return answer(MESSAGE);
}, { headers: true });

// The account service holds the signed-in account with a person's name, the name a forward carries for it.
standIn("WEB_SERVER", (one) => {
  if (one.path === "/users/1") return answer({ user: "1", name: "tester", fullName: "person-a", administrator: true, senders: [] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const react = await routeOf<MessageAct>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/reaction.put");
const unreact = await routeOf<MessageAct>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/reaction.delete");
const pin = await routeOf<MessageAct>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/pin.put");
const forward = await routeOf<ForwardedMessage>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/forward.post");
const edit = await routeOf<MessageAct>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/edit.patch");
const remove = await routeOf<MessageAct>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/remove.delete");
const pins = await routeOf<RoomPins>("../../apps/web/server/api/rooms/[chatId]/pins.get");
const stickers = await routeOf<StickerSet>("../../apps/web/server/api/rooms/[chatId]/stickers.get");
const sticker = await routeOf<SentMessage>("../../apps/web/server/api/rooms/[chatId]/stickers.post");

const params = (messageId: string) => ({ chatId: "-7", messageId });
// The changes the routes asked of the receiver, beside the read of whose room the room is that stands before each.
const acts = () => receiver.asked.filter((one) => one.method !== "GET");

describe("the reader's own acts on a message", () => {
  test("puts their reaction on and takes it off, answering the message's number", async () => {
    receiver.asked.length = 0;

    expect((await asked(react, { params: params("21"), body: { emoji: "👍" } })).answer).toEqual({ messageId: "21" });
    expect((await asked(unreact, { params: params("21") })).answer).toEqual({ messageId: "21" });
    expect(acts().map((one) => [one.method, one.path, one.body])).toEqual([
      ["PUT", "/rooms/-7/messages/21/reactions/mine", { emoji: "👍", account: 1 }],
      ["DELETE", "/rooms/-7/messages/21/reactions/mine?account=1", null]
    ]);
  });

  test("names the signed-in person to the receiver by their owner key and role, and their account, on every act", async () => {
    receiver.asked.length = 0;

    await asked(react, { params: params("21"), body: { emoji: "👍" } });
    await asked(pin, { params: params("21"), body: { on: true } });
    await asked(edit, { params: params("21"), body: { text: "new words" } });
    await asked(remove, { params: params("21") });
    await asked(sticker, { params: { chatId: "-7" }, body: { emoji: "🎉" } });

    for (const one of acts()) {
      const account = one.body?.account ?? new URL(`http://unit${one.path}`).searchParams.get("account");

      expect({ path: one.path, key: one.headers?.["owner-key"], role: one.headers?.["owner-role"], account: Number(account) }).toEqual({
        path: one.path,
        key: "1",
        role: "administrator",
        account: 1
      });
    }
  });

  test("sets a pin and takes it off by the direction the screen names", async () => {
    receiver.asked.length = 0;

    expect((await asked(pin, { params: params("21"), body: { on: true } })).answer).toEqual({ messageId: "21" });
    expect((await asked(pin, { params: params("21"), body: { on: false } })).answer).toEqual({ messageId: "21" });
    expect(acts().map((one) => [one.method, one.path, one.body])).toEqual([
      ["PUT", "/rooms/-7/messages/21/pin", { on: true, account: 1 }],
      ["PUT", "/rooms/-7/messages/21/pin", { on: false, account: 1 }]
    ]);
  });

  test("edits the reader's own message with the words the box took", async () => {
    receiver.asked.length = 0;

    expect((await asked(edit, { params: params("21"), body: { text: " new words " } })).answer).toEqual({ messageId: "21" });
    expect(acts().map((one) => [one.method, one.path, one.body])).toEqual([["PATCH", "/rooms/-7/messages/21", { text: "new words", account: 1 }]]);
  });

  test("refuses words that are blank, and a pin that names no direction, before the receiver is asked to change anything", async () => {
    receiver.asked.length = 0;

    expect(await asked(edit, { params: params("21"), body: { text: "   " } })).toMatchObject({ status: 400, message: wording("room.error.edit_empty") });
    expect(await asked(pin, { params: params("21"), body: {} })).toMatchObject({ status: 400, message: wording("room.error.pin_message_direction") });
    expect(await asked(react, { params: params("21"), body: { emoji: "" } })).toMatchObject({ status: 400, message: wording("room.error.reaction_empty") });
    expect(acts()).toEqual([]);
  });

  test("says the receiver's refusal by the pack's sentence for its code", async () => {
    expect(await asked(edit, { params: params("-1"), body: { text: "words" } })).toMatchObject({ status: 403, message: wording("room.error.message_forbidden") });
    expect(await asked(remove, { params: params("-404") })).toMatchObject({ status: 404, message: wording("room.error.message_unknown") });
  });
});

describe("a message the owner forwards", () => {
  test("copies it into the room the picker chose, as the forwarding account under its person's name, and answers where the copy stands", async () => {
    receiver.asked.length = 0;

    expect((await asked(forward, { params: params("21"), body: { to: "-8" } })).answer).toEqual({ room: -8, messageId: "77" });
    expect(acts().map((one) => [one.method, one.path, one.body, one.headers?.["owner-key"], one.headers?.["owner-role"]])).toEqual([
      ["POST", "/rooms/-7/messages/21/forwards", { to: -8, account: 1, name: "person-a" }, "1", "administrator"]
    ]);
  });

  test("refuses a forward with no room, or into the room the message stands in, before the receiver is asked", async () => {
    receiver.asked.length = 0;

    expect(await asked(forward, { params: params("21"), body: {} })).toMatchObject({ status: 400, message: wording("room.error.forward_room") });
    expect(await asked(forward, { params: params("21"), body: { to: "-7" } })).toMatchObject({ status: 400, message: wording("room.error.forward_same_room") });
    expect(receiver.asked).toEqual([]);
  });
});

describe("the room's pins and stickers", () => {
  test("lists the pinned messages newest pin first, in the seconds the screen reads", async () => {
    const page = (await asked(pins, { params: { chatId: "-7" } })).answer!;

    expect(page.items).toEqual([{ messageId: "21", senderName: "person-a", text: "words", pinnedAt: 1_790_000_030 }]);
  });

  test("lists the record's stickers by their emoji", async () => {
    expect((await asked(stickers, { params: { chatId: "-7" } })).answer).toEqual({ items: ["👍", "🎉"] });
  });

  test("sends a sticker as the reader's own message", async () => {
    receiver.asked.length = 0;

    expect((await asked(sticker, { params: { chatId: "-7" }, body: { emoji: "🎉" } })).answer).toEqual({ messageId: "21" });
    expect(acts().map((one) => [one.method, one.path, one.body])).toEqual([["POST", "/rooms/-7/stickers", { emoji: "🎉", account: 1 }]]);
  });

  test("refuses a sticker the screen names none of, before the receiver is asked", async () => {
    receiver.asked.length = 0;

    expect(await asked(sticker, { params: { chatId: "-7" }, body: {} })).toMatchObject({ status: 400, message: wording("room.error.sticker_empty") });
    expect(receiver.asked).toEqual([]);
  });
});

describe("an act on a message numbered past 2^53", () => {
  test("names the message to the receiver by its digits and answers it by them", async () => {
    receiver.asked.length = 0;

    expect((await asked(react, { params: params(HIGH), body: { emoji: "👍" } })).answer).toEqual({ messageId: HIGH });
    expect((await asked(pin, { params: params(HIGH), body: { on: true } })).answer).toEqual({ messageId: HIGH });
    expect((await asked(edit, { params: params(HIGH), body: { text: "words" } })).answer).toEqual({ messageId: HIGH });
    expect((await asked(remove, { params: params(HIGH) })).answer).toEqual({ messageId: HIGH });
    expect((await asked(forward, { params: params(HIGH), body: { to: "-8" } })).answer).toEqual({ room: -8, messageId: HIGH_COPY });
    expect(acts().map((one) => [one.method, one.path])).toEqual([
      ["PUT", `/rooms/-7/messages/${HIGH}/reactions/mine`],
      ["PUT", `/rooms/-7/messages/${HIGH}/pin`],
      ["PATCH", `/rooms/-7/messages/${HIGH}`],
      ["DELETE", `/rooms/-7/messages/${HIGH}?account=1`],
      ["POST", `/rooms/-7/messages/${HIGH}/forwards`]
    ]);
  });

  test("refuses an id that is no signed 64-bit integer's digits before the receiver is asked", async () => {
    receiver.asked.length = 0;

    for (const id of ["9223372036854775808", "3.97e18", "0042"]) {
      expect(await asked(react, { params: params(id), body: { emoji: "👍" } })).toMatchObject({ status: 400, message: wording("room.error.bad_message_id") });
    }
    expect(receiver.asked).toEqual([]);
  });
});
