import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { rawNumber } from "../../support/raw-number";
import { answer, standIn } from "../../support/units";

import type { Asked } from "../../support/units";
import type { RouteEvent } from "../../support/nitro";

// A private room in the console (docs/web.md, 「Access」): whose private room a room is, is the receiver's to say, its
// `privateOf` and `sealed` of the room. A sealed private room, whose account is not known yet, is changed by nobody. In another account's private room the administrator reads alone: every change he would make
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
// The owner's private chat while his sender is linked to no account: sealed.
const SEALED = -2;
const HIGH = "3973025898369060353";

const PRIVATE_OF: Record<number, number> = { [PRIVATE]: OWNER, [OWN_CHAT]: ADMINISTRATOR };
// Whose the owner's account is: the administrator's, its link standing or not yet.
const LINKED = async () => ({ account: ADMINISTRATOR, linked: true });
const UNLINKED = async () => ({ account: ADMINISTRATOR, linked: false });
const privacy = (room: number) => ({ privateOf: PRIVATE_OF[room] ?? null, sealed: room === SEALED });

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
    const room = Number(/^\/(?:rooms|pinned-rooms|avatars\/room)\/(-?\d+)/.exec(path)?.[1] ?? one.body?.room);

    if (one.method === "GET" && /^\/rooms\/-?\d+$/.test(path)) return answer({ id: room, title: null, ...privacy(room) });
    if (one.method === "GET" && path === "/owner") return answer({ room: SEALED, senderId: 900 });
    if (one.method === "GET" && /^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: [] });
    if (one.method === "GET" && path === "/rooms") {
      return answer({ items: [PRIVATE, OWN_CHAT, LEFT, GROUP, SEALED].map((id) => ({ id, title: null, ...privacy(id) })), more: false });
    }
    if (one.method === "GET" && path === "/providers") return answer({ items: [{ key: "record", label: "Record" }], more: false });
    if (one.method === "GET" && path.endsWith("/providers")) return answer({ providers: ["record"], chosen: true });
    if (one.method === "GET") return answer({ code: "failed", error: "Not served here." }, 500);

    // The receiver's own refusal: a write naming any account but the room's own in a private room — a forward's
    // source and the room it goes into both — and any change of a private room's members; and the room it holds as
    // private where the console does not. The administrator's removal of a room, which the receiver takes in every
    // room, stands before it.
    const removal = one.method === "DELETE" && /^\/rooms\/-?\d+$/.test(path);

    if (removal && named(one) === ADMINISTRATOR) return answer({ goes: [], stays: [], taken: [], cleared: [], pictures: [], folders: [], warned: [] });

    const touched = path.endsWith("/forwards") ? [room, Number(one.body?.to)] : [room];
    const members = /\/accounts\/\d+$/.test(path);
    const refusedIn = touched.find((into) => into === REFUSED || into === SEALED || (PRIVATE_OF[into] !== undefined && (members || named(one) !== PRIVATE_OF[into])));

    if (refusedIn !== undefined) {
      return answer({ code: "private-room", error: "Another account's private room.", room: refusedIn, account: named(one) ?? 0 }, 403);
    }

    const into = touched.at(-1)!;

    if (members) return one.method === "PUT" ? answer({ account: "10", addedBy: one.body?.by, addedAt: 1 }) : new Response(null, { status: 204 });
    if (path.endsWith("/words")) return answer({ id: rawNumber(HIGH) }, 201);
    if (path.endsWith("/word-files")) return answer({ sent: [{ name: "note.txt", id: rawNumber(HIGH) }], checking: [], failed: [] });
    if (path.endsWith("/forwards")) return answer({ room: into, id: rawNumber(HIGH) }, 201);
    if (path.endsWith("/reading")) return answer({ state: "making", briefingId: null }, 202);
    if (path.startsWith("/pinned-rooms")) return answer({ roomIds: [room] });
    if (path.startsWith("/avatars/")) return answer({ items: [{ kind: "room", id: room, takenAt: 1 }] });
    if (path.endsWith("/providers")) return answer({ providers: one.body?.providers, chosen: true });
    if (path.endsWith("/registration")) return answer({ mode: one.body?.mode, providers: ["record"], chosen: true, answerers: [], readOnly: false, readOnlyBy: [] });
    if (one.method === "DELETE" && /^\/rooms\/-?\d+$/.test(path)) return answer({ goes: [], stays: [], taken: [], cleared: [], pictures: [], folders: [], warned: [] });

    return answer({ id: rawNumber(HIGH), kind: "text" });
  }
);

standIn("AGENCY", () => answer({ items: [] }));

const accounts = standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: user === String(ADMINISTRATOR), senders: [] });
  if (one.path === "/checks/entry") return answer({ allowed: true, grant: "bmo_room:0#entry", user: one.body?.user });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => session;
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const { actingAccount, changeJudge } = await import("../../../apps/web/server/utils/room-reach");
const { roomPrivacies } = await import("../../../apps/web/server/utils/console-rooms");

const AS_ADMINISTRATOR = { user: { name: "boss", id: ADMINISTRATOR }, sid: "bmo.sid=boss", administrator: true };
const AS_OWNER = { user: { name: `account-${OWNER}`, id: OWNER }, sid: "bmo.sid=owner", administrator: false };

const route = async (path: string) => await routeOf<unknown>(`../../apps/web/server/api/${path}`);
const file = { name: "file", filename: "note.txt", type: "text/plain", data: new TextEncoder().encode("words") };

// Every change of a room the console makes for a person, each with the request that makes it in a room.
interface WriteAct {
  name: string;
  handler: (event: RouteEvent) => Promise<unknown>;
  event: (room: number) => RouteEvent;
  // Where the change goes: the receiver, or the account service, which keeps the call grant.
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
  { name: "let in", handler: await route("rooms/[chatId]/accounts/[user].put"), event: (room) => person(room), unit: "receiver" },
  { name: "take out", handler: await route("rooms/[chatId]/accounts/[user].delete"), event: (room) => person(room), unit: "receiver" }
];

const forward = await route("rooms/[chatId]/messages/[messageId]/forward.post");
const picture = { name: "picture", filename: "face.png", type: "image/png", data: new Uint8Array([137, 80, 78, 71]) };
const roomOnly = (room: number, extra: Omit<RouteEvent, "params"> = {}): RouteEvent => ({ params: { chatId: String(room) }, ...extra });
const roomPicture = (room: number, extra: Omit<RouteEvent, "params"> = {}): RouteEvent => ({ params: { kind: "room", id: String(room) }, ...extra });

// The administrator's own acts on a room, which stand beside a person's.
const ADMINISTRATOR_ACTS: WriteAct[] = [
  { name: "forward into", handler: forward, event: (room) => message(GROUP, { body: { to: room } }), unit: "receiver" },
  { name: "forward out of", handler: forward, event: (room) => message(room, { body: { to: GROUP } }), unit: "receiver" },
  { name: "pin the room", handler: await route("rooms/[chatId]/pin.post"), event: (room) => roomOnly(room, { body: { pinned: true } }), unit: "receiver" },
  { name: "set its mode", handler: await route("rooms/[chatId]/mode.put"), event: (room) => roomOnly(room, { body: { mode: "record-only" } }), unit: "receiver" },
  { name: "set its picture", handler: await route("avatars/[kind]/[id].put"), event: (room) => roomPicture(room, { parts: [picture] }), unit: "receiver" },
  { name: "drop its picture", handler: await route("avatars/[kind]/[id].delete"), event: (room) => roomPicture(room), unit: "receiver" }
];

// A room's removal, which the administrator makes in every room he reads (docs/web.md, the room menu's removal of its registration).
const REMOVE: WriteAct = { name: "remove it", handler: await route("rooms/[chatId]/remove.post"), event: (room) => roomOnly(room), unit: "receiver" };

// The changes asked of a unit; the account service's read of whose senders are linked goes by POST and changes nothing.
const writes = (stood: { asked: Asked[] }) => stood.asked.filter((one) => one.method !== "GET" && one.path !== "/senders/users");

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

describe("removing a room, the administrator", () => {
  for (const [what, room] of [["his own private chat", OWN_CHAT], ["another account's private room", PRIVATE], ["a sealed room", SEALED]] as const) {
    test(`removes ${what}, the removal named as his account`, async () => {
      expect((await act(REMOVE, room, AS_ADMINISTRATOR)).status).toBe(200);
      expect(writes(receiver).map(named)).toEqual([ADMINISTRATOR]);
    });
  }

  test("reads the preview of removing another account's private room from the receiver", async () => {
    session = AS_ADMINISTRATOR;
    receiver.asked.length = 0;

    const preview = await route("rooms/[chatId]/remove.get");

    expect((await asked(preview, roomOnly(PRIVATE))).status).toBe(200);
    expect(receiver.asked.filter((one) => one.path.startsWith(`/rooms/${PRIVATE}?`))).toHaveLength(1);
  });
});

describe("the private rooms the room list names", () => {
  test("are each room's privateOf and sealed as the receiver says it, a group room every other member has left among none", async () => {
    expect(await roomPrivacies()).toEqual(
      new Map([
        [PRIVATE, { privateOf: OWNER, sealed: false }],
        [OWN_CHAT, { privateOf: ADMINISTRATOR, sealed: false }],
        [SEALED, { privateOf: null, sealed: true }]
      ])
    );
  });
});

describe("a sealed private room", () => {
  for (const one of [...PERSON_ACTS, ...ADMINISTRATOR_ACTS]) {
    test(`is changed by nobody: the administrator is refused 403 to ${one.name}, and nothing reaches a unit`, async () => {
      expect(await act(one, SEALED, AS_ADMINISTRATOR)).toMatchObject({ status: 403, message: wording("room.error.private_room") });
      expect(writes(receiver)).toEqual([]);
      expect(writes(accounts)).toEqual([]);
    });
  }

  test("is changed by no account, and on the owner's own road only where it is his own private chat", async () => {
    const sealed = { privateOf: null, sealed: true };
    const boss = { name: "boss", id: ADMINISTRATOR, administrator: true };
    const consoleLogin = { name: "boss", id: null, administrator: true };
    const member = { name: "member", id: OWNER, administrator: false };

    // While the owner's sender stands linked to none, the owner's account and the console login before the model write
    // on the owner's own road, in his own private chat alone; nobody else writes in a sealed room.
    expect(await changeJudge(boss, UNLINKED)(SEALED, sealed)).toBe(true);
    expect(await changeJudge(boss, UNLINKED)(-99, sealed)).toBe(false);
    expect(await changeJudge(consoleLogin, UNLINKED)(SEALED, sealed)).toBe(true);
    expect(await changeJudge(consoleLogin, UNLINKED)(-99, sealed)).toBe(false);
    expect(await changeJudge(member, UNLINKED)(SEALED, sealed)).toBe(false);
    // Once it is linked the owner is his account like any other, and a room still sealed is changed by nobody.
    expect(await changeJudge(boss, LINKED)(SEALED, sealed)).toBe(false);
    // On the road while unlinked he writes in no account's private room, his own BMO's among them, as the receiver
    // takes the owner's road; once linked he writes in his own as any account does.
    expect(await changeJudge(boss, UNLINKED)(-50, { privateOf: ADMINISTRATOR, sealed: false })).toBe(false);
    expect(await changeJudge(boss, LINKED)(-50, { privateOf: ADMINISTRATOR, sealed: false })).toBe(true);
  });
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
  const consoleLogin = { name: "boss", id: null, administrator: true };

  test("is the signed-in account, or for a console login on the owner's road the owner's account once it is linked", async () => {
    expect(await actingAccount({ name: "member", id: 7, administrator: false })).toBe(7);
    expect(await actingAccount(consoleLogin, LINKED)).toBe(ADMINISTRATOR);
    // While the owner's sender stands linked to none the owner's road acts for no account, as the receiver takes it.
    expect(await actingAccount(consoleLogin, UNLINKED)).toBeNull();
  });

  test("judges the owner's road in the administrator's own private room by the same fact the receiver does", async () => {
    const own = { privateOf: ADMINISTRATOR, sealed: false };

    expect(await changeJudge(consoleLogin, UNLINKED)(-50, own)).toBe(false);
    expect(await changeJudge(consoleLogin, LINKED)(-50, own)).toBe(true);
  });
});

describe("a room's picture", () => {
  test("is served to whoever reads the room, and to nobody else, nothing asked of the room they do not read", async () => {
    session = AS_OWNER;
    receiver.asked.length = 0;

    const picture = await route("avatars/[kind]/[id].get");
    const room = (chat: number) => ({ params: { kind: "room", id: String(chat) }, context: { readableRooms: new Set([PRIVATE]) } });

    expect((await asked(picture, room(GROUP))).status).toBe(404);
    expect(receiver.asked.some((one) => one.path.includes(String(GROUP)))).toBe(false);

    await asked(picture, room(PRIVATE));
    expect(receiver.asked.some((one) => one.path === `/rooms/${PRIVATE}/avatar`)).toBe(true);
  });
});
