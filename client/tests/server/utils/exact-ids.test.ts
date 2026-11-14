import { describe, expect, test } from "bun:test";

import { exactFrame } from "../../../apps/web/server/utils/bot-relay";
import { exactJson, exactJsonText } from "../../../apps/web/server/utils/exact-json";
import { rewrittenFrame } from "../../../apps/web/server/utils/sse-frames";

// A message id past 2^53 is read and written by its digits (docs/web.md, 「A message's id」): two neighbours a
// JavaScript number reads as one stay two.
const HIGH = "3973025898369060353";
const NEXT = "3973025898369060354";

describe("an answer read with its message ids exact", () => {
  test("each integer under a named key, at any depth, is handed back as the digits the unit wrote", () => {
    const read = exactJson(
      `{"id":${HIGH},"replyToMessageId":${NEXT},"room":7,"forwardedFrom":{"messageId":${NEXT},"room":9},"items":[{"id":${NEXT}}]}`,
      new Set(["id", "replyToMessageId", "messageId"])
    );

    expect(read).toEqual({ id: HIGH, replyToMessageId: NEXT, room: 7, forwardedFrom: { messageId: NEXT, room: 9 }, items: [{ id: NEXT }] });
  });

  test("a null stays null and an integer under any other key stays a number", () => {
    expect(exactJson(`{"messageId":null,"chatId":${HIGH}}`, new Set(["messageId"]))).toEqual({ messageId: null, chatId: Number(HIGH) });
  });
});

describe("a body written with its message ids exact", () => {
  test("an id under a named key stands as the integer it is, digit for digit, and the rest as JSON writes it", () => {
    expect(exactJsonText({ chatId: 7, text: "words", replyTo: HIGH }, new Set(["replyTo"]))).toBe(`{"chatId":7,"text":"words","replyTo":${HIGH}}`);
  });

  test("a null, a string under any other key and text that is no id stay as JSON writes them", () => {
    expect(exactJsonText({ replyTo: null, note: HIGH }, new Set(["replyTo"]))).toBe(`{"replyTo":null,"note":"${HIGH}"}`);
    expect(exactJsonText({ replyTo: "first" }, new Set(["replyTo"]))).toBe(`{"replyTo":"first"}`);
  });
});

describe("a relayed event's message ids", () => {
  test("the receiver's event names its message as a string, its event number and its name kept", () => {
    const frame = exactFrame(`id: 41\nevent: bot\ndata: {"id":41,"type":"message","chatId":7,"messageId":${HIGH}}\n\n`);

    expect(frame).toBe(`id: 41\nevent: bot\ndata: {"id":41,"type":"message","chatId":7,"messageId":"${HIGH}"}\n\n`);
  });

  test("the live picture's turns and queue name their messages as strings", () => {
    const frame = exactFrame(`event: live\ndata: {"at":1,"turns":[{"chatId":7,"messageId":${HIGH}}],"queued":[{"chatId":7,"messageId":${NEXT}}]}\n\n`);
    const data = JSON.parse(frame.split("data: ")[1]!) as { turns: { messageId: unknown }[]; queued: { messageId: unknown }[] };

    expect([data.turns[0]!.messageId, data.queued[0]!.messageId]).toEqual([HIGH, NEXT]);
  });

  test("a comment and an event whose data is no object stand as they came", () => {
    expect(exactFrame(": ping\n\n")).toBe(": ping\n\n");
    expect(rewrittenFrame("event: run\ndata: not json\n\n", (data) => data)).toBe("event: run\ndata: not json\n\n");
    expect(exactFrame("event: run\ndata: not json\n\n")).toBe("event: run\ndata: not json\n\n");
  });
});
