import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { MessageAct, SentAttachments, SentMessage } from "../../../apps/web/shared/types";

// Words said in the console (docs/web.md, the room screen's input box, and 「Access」): every account says them under its
// own account through the receiver's account-named routes, the owner's among them, and no console route reaches the
// receiver's owner routes for an account that is not the owner's. Only a console login standing before the account
// model, which is the owner's, says them on the owner's route. In another person's private room with their own BMO
// the administrator reads alone: every change he would make there is refused 403, while a group room stands open to
// his acts.

const GROUP = -7;
const PRIVATE = -21;
const SHARED = -22;
const OWNER_ROOM = -1;
const OWNER_SENDER = 900;
// A message id past 2^53, which the answer must carry as the digits it is.
const HIGH = "3973025898369060353";

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/owner") return answer({ room: OWNER_ROOM, senderId: OWNER_SENDER });
  if (path === "/rooms" && one.method === "GET") return answer({ items: [], more: false });
  if (/^\/rooms\/-?\d+\/words$/.test(path)) return answer({ id: rawNumber(HIGH) }, 201);
  if (/^\/rooms\/-?\d+\/word-files$/.test(path)) return answer({ sent: [{ name: "note.txt", id: rawNumber(HIGH) }], checking: [], failed: [] });
  if (path === "/owner/messages") return answer({ id: 5 }, 201);
  if (path === "/owner/message-files") return answer({ sent: [{ name: "note.txt", id: 5 }], checking: [], failed: [] });
  if (/^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: [] });
  // Both rooms are led by account 9; the private one holds no other account, the shared one holds account 10 too.
  if (path === `/rooms/${PRIVATE}/leaders` || path === `/rooms/${SHARED}/leaders`) return answer({ room: 0, leaders: [9] });
  if (/^\/rooms\/-?\d+\/leaders$/.test(path)) return answer({ room: 0, leaders: [] });
  if (/^\/rooms\/-?\d+\/providers$/.test(path)) return answer({ providers: [], chosen: false });
  if (path === `/rooms/${SHARED}/accounts`) return answer({ accounts: [{ account: "9" }, { account: "10" }] });
  if (/^\/rooms\/-?\d+\/accounts$/.test(path)) return answer({ accounts: [] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

standIn("AGENCY", () => answer({ items: [] }));

const accounts = standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: user === "1", senders: user === "1" ? [OWNER_SENDER] : [] });

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
const react = await routeOf<MessageAct>("../../apps/web/server/api/rooms/[chatId]/messages/[messageId]/reaction.put");
const grantCaller = await routeOf<void>("../../apps/web/server/api/rooms/[chatId]/callers/[user].put");
const letIn = await routeOf<void>("../../apps/web/server/api/rooms/[chatId]/accounts/[user].put");
const talk = await routeOf<{ ok: true }>("../../apps/web/server/api/documents/talk.post");

const file = (name: string) => ({ name: "file", filename: name, type: "text/plain", data: new TextEncoder().encode("words") });
const field = (name: string, value: string) => ({ name, data: new TextEncoder().encode(value) });
// A member's room list, read before any of these routes runs, holds the group room.
const memberRooms = () => ({ readableRooms: new Set([GROUP]) });
const owners = () => receiver.asked.filter((one) => one.path.startsWith("/owner/"));

describe("a member's words", () => {
  test("are said under the member's own account and never through the owner's routes", async () => {
    session = MEMBER;
    receiver.asked.length = 0;

    const said = await asked(say, { params: { chatId: String(GROUP) }, body: { text: "hello", replyTo: "21" }, context: memberRooms() });

    expect(said.answer).toEqual({ messageId: HIGH });
    expect(receiver.asked.map((one) => [one.method, one.path, one.body])).toEqual([
      ["POST", `/rooms/${GROUP}/words`, { account: "7", text: "hello", replyTo: 21 }]
    ]);
  });

  test("carry the member's account with their files and their voice note, and never reach the owner's files route", async () => {
    session = MEMBER;
    receiver.asked.length = 0;

    const sent = await asked(attach, { params: { chatId: String(GROUP) }, parts: [field("caption", "a file"), file("note.txt")], context: memberRooms() });
    const recorded = await asked(voice, { params: { chatId: String(GROUP) }, parts: [file("note.txt")], context: memberRooms() });

    expect(sent.answer).toEqual({ sent: [{ name: "note.txt", messageId: HIGH }], failed: [], checking: [] });
    expect(recorded.answer).toEqual({ messageId: HIGH });
    expect(receiver.asked.map((one) => one.path)).toEqual([`/rooms/${GROUP}/word-files`, `/rooms/${GROUP}/word-files`]);

    for (const one of receiver.asked) {
      expect(one.raw).toMatch(/name="account"\r\n\r\n7\r\n/);
    }

    expect(receiver.asked[1]?.raw).toMatch(/name="voice"\r\n\r\ntrue\r\n/);
    expect(owners()).toEqual([]);
  });

  test("about a document are refused 403, since the talk is the owner's private chat", async () => {
    session = MEMBER;
    receiver.asked.length = 0;

    expect((await asked(talk, { body: { root: "docs", path: "a.md", text: "a question" } })).status).toBe(403);
    expect(receiver.asked.some((one) => one.path === "/talks")).toBe(false);
  });
});

describe("the owner's words", () => {
  test("from his account reach the receiver as his account, the receiver filing them under his own sender", async () => {
    session = ADMINISTRATOR;
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: String(OWNER_ROOM) }, body: { text: "hello" } })).answer).toEqual({ messageId: HIGH });
    expect(receiver.asked.filter((one) => one.method === "POST").map((one) => [one.path, one.body])).toEqual([
      [`/rooms/${OWNER_ROOM}/words`, { account: "1", text: "hello" }]
    ]);
    expect(owners()).toEqual([]);
  });

  test("from a console login standing before the account model go on his own route, as they always did", async () => {
    session = CONSOLE_LOGIN;
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: String(GROUP) }, body: { text: "hello" } })).answer).toEqual({ messageId: "5" });
    expect(receiver.asked.map((one) => [one.method, one.path])).toEqual([["POST", "/owner/messages"]]);
  });
});

describe("in another person's private room with their own BMO, the administrator", () => {
  test("says, attaches, records, reacts, sets callers and lets people in nowhere: each is refused 403", async () => {
    session = ADMINISTRATOR;
    receiver.asked.length = 0;
    accounts.asked.length = 0;

    const room = { chatId: String(PRIVATE) };

    expect((await asked(say, { params: room, body: { text: "hello" } })).status).toBe(403);
    expect((await asked(attach, { params: room, parts: [file("note.txt")] })).status).toBe(403);
    expect((await asked(voice, { params: room, parts: [file("note.txt")] })).status).toBe(403);
    expect((await asked(react, { params: { ...room, messageId: "21" }, body: { emoji: "👍" } })).status).toBe(403);
    expect((await asked(grantCaller, { params: { ...room, user: "10" } })).status).toBe(403);
    expect((await asked(letIn, { params: { ...room, user: "10" }, body: { caller: true } })).status).toBe(403);
    // Nothing was said, reacted to or let in; only the reads that told whose room it is were made.
    expect(receiver.asked.filter((one) => one.method !== "GET")).toEqual([]);
    expect(accounts.asked.filter((one) => one.method !== "GET")).toEqual([]);
  });

  test("still says his words in a group room he administers", async () => {
    session = ADMINISTRATOR;
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: String(SHARED) }, body: { text: "hello" } })).answer).toEqual({ messageId: HIGH });
    expect(receiver.asked.filter((one) => one.method === "POST").map((one) => one.path)).toEqual([`/rooms/${SHARED}/words`]);
  });
});
