import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { Asked } from "../../support/units";
import type { RouteEvent } from "../../support/nitro";

// A private room in the console (docs/web.md, 「Access」): whose private room a room is, is the receiver's to say, its
// `privateOf` of the room. In another account's private room the administrator reads alone: every change he would make
// there is refused 403 before anything is asked, and every change the console makes for a person names the account it
// is made as, so the receiver refuses the same where the console did not. The account whose private room it is
// changes it as any member changes a room. A group room every other member has left is no one's private room.

const OWNER = 9;
const ADMINISTRATOR = 1;
// Account 9's private room with its own BMO; the administrator's own private chat; a group room 9 opened that every
// other member has left; a room the console takes for no one's that the receiver refuses as private all the same.
const PRIVATE = -21;
const OWN_CHAT = -1;
const LEFT = -24;
const REFUSED = -23;
const GROUP = -7;
const HIGH = "3973025898369060353";

const PRIVATE_OF: Record<number, number> = { [PRIVATE]: OWNER, [OWN_CHAT]: ADMINISTRATOR };

// The account a write names, in its body, its form or its query, as the receiver reads it.
function named(one: Asked): number | null {
  const query = new URL(`http://unit${one.path}`).searchParams.get("account");
  const formed = /name="account"\r\n\r\n(\d+)\r\n/.exec(one.raw ?? "")?.[1];
  const said = one.body?.account ?? query ?? formed;

  return said === undefined || said === null ? null : Number(said);
}

// The account a change of a room's members is made by, in its body or its query.
function by(one: Asked): number | null {
  const said = one.body?.by ?? new URL(`http://unit${one.path}`).searchParams.get("by");

  return said === undefined || said === null ? null : Number(said);
}

const receiver = standIn(
  "RECEIVER",
  (one) => {
    const path = one.path.split("?")[0] ?? "";
    const room = Number(/^\/(?:rooms|pinned-rooms)\/(-?\d+)/.exec(path)?.[1] ?? one.body?.room);

    if (one.method === "GET" && /^\/rooms\/-?\d+$/.test(path)) return answer({ id: room, title: null, privateOf: PRIVATE_OF[room] ?? null });
    if (one.method === "GET" && /^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: [] });
    if (one.method === "GET") return answer({ code: "failed", error: "Not served here." }, 500);

    // The receiver's own refusal: a write naming any account but the room's own in a private room, and any change
    // of a private room's members; and the room it holds as private where the console does not.
    const into = path.endsWith("/forwards") ? Number(one.body?.to) : room;
    const own = PRIVATE_OF[into];
    const members = /\/accounts\/\d+$/.test(path);

    if (into === REFUSED || (own !== undefined && (members || named(one) !== own))) {
      return answer({ code: "private-room", error: "Another account's private room.", room: into, account: named(one) ?? 0 }, 403);
    }

    if (members) return one.method === "PUT" ? answer({ account: "10", addedBy: one.body?.by, addedAt: 1 }) : new Response(null, { status: 204 });
    if (path.endsWith("/words")) return answer({ id: rawNumber(HIGH) }, 201);
    if (path.endsWith("/word-files")) return answer({ sent: [{ name: "note.txt", id: rawNumber(HIGH) }], checking: [], failed: [] });
    if (path.endsWith("/forwards")) return answer({ room: into, id: rawNumber(HIGH) }, 201);
    if (path.endsWith("/reading")) return answer({ state: "making", briefingId: null }, 202);
    if (path.startsWith("/pinned-rooms")) return answer({ roomIds: [room] });

    return answer({ id: rawNumber(HIGH), kind: "text" });
  }
);

standIn("AGENCY", () => answer({ items: [] }));

const accounts = standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: user === String(ADMINISTRATOR), senders: [] });
  if (one.path === "/checks/entry") return answer({ allowed: true, grant: "bmo_room:0#entry", user: one.body?.user });
  if (/^\/rooms\/-?\d+\/callers\/\d+$/.test(one.path)) return new Response(null, { status: 204 });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => session;
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const { actingAccount } = await import("../../../apps/web/server/utils/room-reach");

const AS_ADMINISTRATOR = { user: { name: "boss", id: ADMINISTRATOR }, sid: "bmo.sid=boss", administrator: true };
const AS_OWNER = { user: { name: `account-${OWNER}`, id: OWNER }, sid: "bmo.sid=owner", administrator: false };

const route = async (path: string) => await routeOf<unknown>(`../../apps/web/server/api/${path}`);
const file = { name: "file", filename: "note.txt", type: "text/plain", data: new TextEncoder().encode("words") };

// Every change of a room the console makes for a person, each with the request that makes it in a room.
interface WriteAct {
  name: string;
  handler: (event: RouteEvent) => Promise<unknown>;
  event: (room: number) => RouteEvent;
  // Where the change goes: the receiver, or the account service, which keeps the callers.
  unit: "receiver" | "accounts";
}

const message = (room: number, extra: Omit<RouteEvent, "params"> = {}): RouteEvent => ({ params: { chatId: String(room), messageId: "21" }, ...extra });
const person = (room: number, extra: Omit<RouteEvent, "params"> = {}): RouteEvent => ({ params: { chatId: String(room), user: "10" }, ...extra });

const PERSON_ACTS: WriteAct[] = [
  { name: "say", handler: await route("rooms/[chatId]/say.post"), event: (room) => ({ params: { chatId: String(room) }, body: { text: "hello" } }), unit: "receiver" },
  { name: "attach", handler: await route("rooms/[chatId]/attach.post"), event: (room) => ({ params: { chatId: String(room) }, parts: [file] }), unit: "receiver" },
  { name: "voice", handler: await route("rooms/[chatId]/voice.post"), event: (room) => ({ params: { chatId: String(room) }, parts: [file] }), unit: "receiver" },
  { name: "sticker", handler: await route("rooms/[chatId]/stickers.post"), event: (room) => ({ params: { chatId: String(room) }, body: { emoji: "x" } }), unit: "receiver" },
  { name: "react", handler: await route("rooms/[chatId]/messages/[messageId]/reaction.put"), event: (room) => message(room, { body: { emoji: "x" } }), unit: "receiver" },
  { name: "unreact", handler: await route("rooms/[chatId]/messages/[messageId]/reaction.delete"), event: (room) => message(room), unit: "receiver" },
  { name: "edit", handler: await route("rooms/[chatId]/messages/[messageId]/edit.patch"), event: (room) => message(room, { body: { text: "changed" } }), unit: "receiver" },
  { name: "pin a message", handler: await route("rooms/[chatId]/messages/[messageId]/pin.put"), event: (room) => message(room, { body: { on: true } }), unit: "receiver" },
  { name: "delete", handler: await route("rooms/[chatId]/messages/[messageId]/remove.delete"), event: (room) => message(room), unit: "receiver" },
  { name: "read aloud", handler: await route("rooms/[chatId]/messages/[messageId]/reading.post"), event: (room) => message(room), unit: "receiver" },
  { name: "make a caller", handler: await route("rooms/[chatId]/callers/[user].put"), event: (room) => person(room), unit: "accounts" },
  { name: "drop a caller", handler: await route("rooms/[chatId]/callers/[user].delete"), event: (room) => person(room), unit: "accounts" },
  { name: "let in", handler: await route("rooms/[chatId]/accounts/[user].put"), event: (room) => person(room, { body: { caller: false } }), unit: "receiver" },
  { name: "take out", handler: await route("rooms/[chatId]/accounts/[user].delete"), event: (room) => person(room), unit: "receiver" }
];

// The administrator's own acts on a room, which stand beside a person's.
const ADMINISTRATOR_ACTS: WriteAct[] = [
  { name: "forward into", handler: await route("rooms/[chatId]/messages/[messageId]/forward.post"), event: (room) => message(GROUP, { body: { to: room } }), unit: "receiver" },
  { name: "pin the room", handler: await route("rooms/[chatId]/pin.post"), event: (room) => ({ params: { chatId: String(room) }, body: { pinned: true } }), unit: "receiver" }
];

const writes = (stood: { asked: Asked[] }) => stood.asked.filter((one) => one.method !== "GET");

async function act(one: WriteAct, room: number, as: Record<string, unknown>, rooms?: number[]) {
  session = as;
  receiver.asked.length = 0;
  accounts.asked.length = 0;

  const event = one.event(room);

  return await asked(one.handler, { ...event, context: rooms === undefined ? {} : { readableRooms: new Set(rooms) } });
}

describe("in another account's private room, the administrator", () => {
  for (const one of [...PERSON_ACTS, ...ADMINISTRATOR_ACTS]) {
    test(`is refused 403 to ${one.name}, and nothing reaches a unit`, async () => {
      expect(await act(one, PRIVATE, AS_ADMINISTRATOR)).toMatchObject({ status: 403, message: wording("room.error.private_room") });
      expect(writes(receiver)).toEqual([]);
      expect(writes(accounts)).toEqual([]);
    });
  }
});

describe("in their own private room, the account whose room it is", () => {
  for (const one of PERSON_ACTS) {
    test(`may ${one.name}, the change named as their account`, async () => {
      const done = await act(one, PRIVATE, AS_OWNER, [PRIVATE]);

      if (one.unit === "accounts") {
        expect(done.status).toBe(200);
        expect(writes(accounts)).toHaveLength(1);

        return;
      }

      // The receiver takes no change of a private room's members from anyone; the console leaves that refusal to it.
      expect(done.status).toBe(/\/accounts\//.test(writes(receiver)[0]?.path ?? "") ? 403 : 200);
      expect(writes(receiver).map((asking) => named(asking) ?? by(asking))).toEqual([OWNER]);
    });
  }

  for (const one of ADMINISTRATOR_ACTS) {
    test(`may ${one.name} where it is the administrator's own private chat`, async () => {
      expect((await act(one, OWN_CHAT, AS_ADMINISTRATOR)).status).toBe(200);
      expect(writes(receiver).map(named)).toEqual([ADMINISTRATOR]);
    });
  }
});

describe("a group room every other member has left", () => {
  for (const one of [...PERSON_ACTS, ...ADMINISTRATOR_ACTS]) {
    test(`is no one's private room: the administrator may ${one.name}`, async () => {
      expect((await act(one, LEFT, AS_ADMINISTRATOR)).status).toBe(200);
    });
  }
});

describe("a change the receiver refuses in a room it holds as private", () => {
  for (const one of PERSON_ACTS.filter((each) => ["say", "sticker", "react", "edit", "delete", "read aloud"].includes(each.name))) {
    test(`is said by the pack's sentence for it: ${one.name}`, async () => {
      expect(await act(one, REFUSED, AS_OWNER, [REFUSED])).toMatchObject({ status: 403, message: wording("room.error.private_room") });
    });
  }

  test("is said by the pack's sentence for each file of an attachment", async () => {
    const done = await act(PERSON_ACTS.find((each) => each.name === "attach")!, REFUSED, AS_OWNER, [REFUSED]);

    expect(done.answer).toMatchObject({ sent: [], failed: [{ name: "note.txt", reason: `note.txt: ${wording("room.error.private_room")}` }] });
  });
});

describe("the account a change is made as", () => {
  test("is the signed-in account, or the administrator's for a console login standing before the account model", async () => {
    expect(await actingAccount({ name: "member", id: 7, administrator: false })).toBe(7);
    expect(await actingAccount({ name: "boss", id: null, administrator: true }, async () => "1")).toBe(1);
    // Before the model names an administrator, the console login is no account, so another's private room refuses it.
    expect(await actingAccount({ name: "boss", id: null, administrator: true }, async () => null)).toBeNull();
  });
});
