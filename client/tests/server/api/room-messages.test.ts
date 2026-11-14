import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { MessagePage, RoomPast } from "../../../apps/web/shared/types";

// A room's page read by a cursor, and where its line begins (docs/web.md, the room screen's 「A cursor is a place, not
// a number」 and 「Where a room's line begins」). A chat service may number its messages past 2^53, so every cursor names
// its row by the digits the receiver wrote, and a value that is no signed 64-bit integer is refused before the receiver
// is asked. Which chat services read a room's past back is told by the verbs each one's road in the room performs;
// nothing here reads which service a key names, so the keys are neutral.

// Two rows a JavaScript number reads as one.
const HIGH = ["3973025898369060353", "3973025898369060354"];

const row = (id: string) => ({
  id: rawNumber(id),
  room: -12,
  senderId: 11,
  senderName: "person-a",
  sentAt: 1_790_000_000_000,
  text: "words",
  imagePath: null,
  replyToMessageId: null,
  answerSeconds: null,
  round: null,
  album: null,
  via: null,
  files: []
});

const listed = [{ key: "provider-a", label: "Provider A" }, { key: "provider-b", label: "Provider B" }];

const receiver = standIn("RECEIVER", (one) => {
  const url = new URL(one.path, "http://receiver");

  if (url.pathname === "/rooms/-12/messages") return answer({ items: [row(HIGH[0]!)], more: false });
  if (url.pathname === `/rooms/-12/messages/${HIGH[0]}`) return answer(row(HIGH[0]!));
  if (url.pathname === "/rooms/-12/answerers") return answer({ default: "", voice: "", items: [], more: false });
  if (url.pathname === "/providers") return answer({ items: listed, more: false });
  if (url.pathname === "/rooms/-12/providers") return answer({ providers: ["provider-b", "provider-a"], chosen: false });
  if (url.pathname === "/rooms/-13/providers") return answer({ providers: ["provider-b"], chosen: false });
  if (url.pathname === "/rooms/-12/send-verbs" || url.pathname === "/rooms/-13/send-verbs") {
    return answer({ items: url.searchParams.get("via") === "provider-a" ? ["text", "history"] : ["text", "photo"], more: false });
  }
  if (url.pathname === "/rooms/-14/providers") return answer({ code: "failed", error: "the store did not answer" }, 503);

  return answer({ code: "not-found", error: "Not served here." }, 404);
});

// The administrator reads every room, so whether a room may be read asks nothing here.
const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireReadableRoom", "readableRooms"]);
globals.requireReadableRoom = async () => undefined;
globals.readableRooms = async () => "all";

const page = await routeOf<MessagePage>("../../apps/web/server/api/rooms/[chatId]/messages.get");
const past = await routeOf<RoomPast>("../../apps/web/server/api/rooms/[chatId]/past.get");

// The cursors the route handed the receiver, each as the query it wrote.
function cursors(): string[] {
  return receiver.asked
    .map((one) => new URL(one.path, "http://receiver"))
    .filter((url) => url.pathname.startsWith("/rooms/-12/messages"))
    .filter((url) => !url.pathname.endsWith("/metadata"))
    .map((url) => `${url.pathname}${url.search}`);
}

// The message's own reads a page makes, by the number each named.
function ownReads(): string[] {
  return receiver.asked.map((one) => new URL(one.path, "http://receiver").pathname).filter((path) => path.endsWith("/metadata"));
}

describe("a room's page read by a cursor", () => {
  test("hands the receiver each cursor as the digits it was given, past what a number holds", async () => {
    receiver.asked.length = 0;

    await asked(page, { params: { chatId: "-12" }, query: { before: HIGH[1], limit: "30" } });
    await asked(page, { params: { chatId: "-12" }, query: { after: HIGH[0], limit: "30" } });
    await asked(page, { params: { chatId: "-12" }, query: { at: HIGH[0] } });

    expect(cursors()).toEqual([
      `/rooms/-12/messages?limit=30&before=${HIGH[1]}`,
      `/rooms/-12/messages?limit=30&after=${HIGH[0]}`,
      `/rooms/-12/messages/${HIGH[0]}`
    ]);
    // What a message was sent with is asked by the same digits, never by the number they round to.
    expect(new Set(ownReads())).toEqual(new Set([`/rooms/-12/messages/${HIGH[0]}/metadata`]));
  });

  test("refuses a cursor that is no signed 64-bit integer written plainly, and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const value of ["1.5", "1e3", "+4", "007", "9223372036854775808", "row"]) {
      expect(await asked(page, { params: { chatId: "-12" }, query: { before: value } })).toMatchObject({ status: 400, message: wording("common.error.bad_cursor") });
    }

    expect(cursors()).toEqual([]);
  });
});

describe("where a room's line begins", () => {
  test("names the room's chat services whose road there reads its past back, in the room's order", async () => {
    expect((await asked(past, { params: { chatId: "-12" } })).answer).toEqual({ readers: ["Provider A"] });
  });

  test("names none where no service of the room reads its past back, or the receiver cannot say", async () => {
    expect((await asked(past, { params: { chatId: "-13" } })).answer).toEqual({ readers: [] });
    expect((await asked(past, { params: { chatId: "-14" } })).answer).toEqual({ readers: [] });
  });
});
