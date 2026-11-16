import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { SentAttachments, SentMessage } from "../../../apps/web/shared/types";

// Words said in the console (docs/web.md, the room screen's input box, and 「Access」): every account says them under its
// own account through the receiver's account-named routes, the owner's among them, and no console route reaches the
// receiver's owner routes for an account that is not the owner's. Only a console login standing before the account
// model, which is the owner's, says them on the owner's route.

const GROUP = -7;
const OWNER_ROOM = -1;
const OWNER_SENDER = 900;
// A message id past 2^53, which the answer must carry as the digits it is.
const HIGH = "3973025898369060353";

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/owner") return answer({ room: OWNER_ROOM, senderId: OWNER_SENDER });
  if (path === "/rooms" && one.method === "GET") return answer({ items: [], more: false });
  if (path === "/rooms/-23/words") return answer({ code: "private-room", error: "Another account's private room.", room: -23, account: 7 }, 403);
  // The receiver takes an account as a number and the name it is shown by, and refuses words missing either.
  if (/^\/rooms\/-?\d+\/words$/.test(path)) {
    return typeof one.body?.account === "number" && typeof one.body.name === "string"
      ? answer({ id: rawNumber(HIGH) }, 201)
      : answer({ code: "bad-request", error: "An account and its name are named." }, 400);
  }
  if (/^\/rooms\/-?\d+\/word-files$/.test(path)) return answer({ sent: [{ name: "note.txt", id: rawNumber(HIGH) }], checking: [], failed: [] });
  if (path === "/owner/messages") return answer({ id: 5 }, 201);
  if (path === "/owner/message-files") return answer({ sent: [{ name: "note.txt", id: 5 }], checking: [], failed: [] });
  if (/^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: [] });
  // No room here is anyone's private room; the private room's refusals stand in room-private.test.ts.
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

standIn("AGENCY", () => answer({ items: [] }));

// The account service holds the member with a person's name, which every send names them by whatever their session
// carries, and the administrator by his login alone.
const PEOPLE: Readonly<Record<string, { name: string; fullName: string }>> = {
  "1": { name: "boss", fullName: "" },
  "7": { name: "member-a", fullName: "person-a" }
};

standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  // A user the service fails to answer, whose words still go out under the login the session carries.
  if (user === "9") return answer({ code: "database", error: "The database did not answer." }, 500);
  if (user !== undefined) {
    const person = PEOPLE[user] ?? { name: `account-${user}`, fullName: "" };

    return answer({ user, ...person, administrator: user === "1", senders: user === "1" ? [OWNER_SENDER] : [] });
  }

  return answer({ code: "forbidden", error: "Not this one." }, 403);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => session;
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const MEMBER = { user: { name: "member-a", id: 7 }, sid: "bmo.sid=member", administrator: false };
const ADMINISTRATOR = { user: { name: "boss", id: 1 }, sid: "bmo.sid=boss", administrator: true };
// A seal with no sumida session: the console login standing before the account model, the owner's.
const CONSOLE_LOGIN = { user: { name: "boss" } };

const say = await routeOf<SentMessage>("../../apps/web/server/api/rooms/[chatId]/say.post");
const attach = await routeOf<SentAttachments>("../../apps/web/server/api/rooms/[chatId]/attach.post");
const voice = await routeOf<SentMessage>("../../apps/web/server/api/rooms/[chatId]/voice.post");
const talk = await routeOf<{ ok: true }>("../../apps/web/server/api/documents/talk.post");
const talkRead = await routeOf<unknown>("../../apps/web/server/api/documents/talk.get");
const { accountShownName } = await import("../../../apps/web/server/utils/console-rooms");

const file = (name: string) => ({ name: "file", filename: name, type: "text/plain", data: new TextEncoder().encode("words") });
const field = (name: string, value: string) => ({ name, data: new TextEncoder().encode(value) });
// A member's room list, read before any of these routes runs, holds the group room.
const memberRooms = () => ({ readableRooms: new Set([GROUP]) });
const owners = () => receiver.asked.filter((one) => one.path.startsWith("/owner/"));
// What the routes sent, beside the reads that told whose room each room is.
const sends = () => receiver.asked.filter((one) => one.method !== "GET");

describe("a member's words", () => {
  test("are said under the member's own account and the person's name, and never through the owner's routes", async () => {
    session = MEMBER;
    receiver.asked.length = 0;

    const said = await asked(say, { params: { chatId: String(GROUP) }, body: { text: "hello", replyTo: "21" }, context: memberRooms() });

    expect(said.answer).toEqual({ messageId: HIGH });
    expect(sends().map((one) => [one.method, one.path, one.body])).toEqual([
      ["POST", `/rooms/${GROUP}/words`, { account: 7, name: "person-a", text: "hello", replyTo: 21 }]
    ]);
  });

  test("carry the member's account with their files and their voice note, and never reach the owner's files route", async () => {
    session = MEMBER;
    receiver.asked.length = 0;

    const sent = await asked(attach, { params: { chatId: String(GROUP) }, parts: [field("caption", "a file"), file("note.txt")], context: memberRooms() });
    const recorded = await asked(voice, { params: { chatId: String(GROUP) }, parts: [file("note.txt")], context: memberRooms() });

    expect(sent.answer).toEqual({ sent: [{ name: "note.txt", messageId: HIGH }], failed: [], checking: [] });
    expect(recorded.answer).toEqual({ messageId: HIGH });
    expect(sends().map((one) => one.path)).toEqual([`/rooms/${GROUP}/word-files`, `/rooms/${GROUP}/word-files`]);

    // The room is the path's alone, and the account and its shown name stand beside the files.
    for (const one of sends()) {
      expect(one.raw).toMatch(/name="account"\r\n\r\n7\r\n/);
      expect(one.raw).toMatch(/name="name"\r\n\r\nperson-a\r\n/);
      expect(one.raw).not.toContain('name="chatId"');
    }

    expect(sends()[1]?.raw).toMatch(/name="voice"\r\n\r\ntrue\r\n/);
    expect(owners()).toEqual([]);
  });

  test("refused by the receiver in another account's private room are said by the pack's sentence for it", async () => {
    session = MEMBER;

    const refused = await asked(say, { params: { chatId: "-23" }, body: { text: "hello" }, context: { readableRooms: new Set([-23]) } });

    expect(refused).toMatchObject({ status: 403, message: wording("room.error.private_room") });
  });

  test("about a document are refused 403, since the talk is the owner's private chat", async () => {
    session = MEMBER;
    receiver.asked.length = 0;

    expect((await asked(talk, { body: { root: "docs", path: "a.md", text: "a question" } })).status).toBe(403);
    expect(receiver.asked.some((one) => one.path === "/talks")).toBe(false);
  });

  test("open no way into the talk about a document: its read is refused 403 as well", async () => {
    session = MEMBER;

    expect(await asked(talkRead, { query: { root: "docs", path: "a.md" } })).toMatchObject({ status: 403, message: wording("documents.error.talk_owner_only") });
  });
});

describe("the name an account's words carry", () => {
  test("is the login where the account service does not answer, so the words are never refused for a name", async () => {
    expect(await accountShownName(9, "member-c")).toBe("member-c");
  });
});

describe("the owner's words", () => {
  test("from his account reach the receiver as his account, the receiver filing them under his own sender", async () => {
    session = ADMINISTRATOR;
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: String(OWNER_ROOM) }, body: { text: "hello" } })).answer).toEqual({ messageId: HIGH });
    expect(receiver.asked.filter((one) => one.method === "POST").map((one) => [one.path, one.body])).toEqual([
      [`/rooms/${OWNER_ROOM}/words`, { account: 1, name: "boss", text: "hello" }]
    ]);
    expect(owners()).toEqual([]);
  });

  test("from a console login standing before the account model go on his own route, as they always did", async () => {
    session = CONSOLE_LOGIN;
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: String(GROUP) }, body: { text: "hello" } })).answer).toEqual({ messageId: "5" });
    expect(sends().map((one) => [one.method, one.path])).toEqual([["POST", "/owner/messages"]]);
  });
});
