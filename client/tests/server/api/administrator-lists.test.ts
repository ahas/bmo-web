import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ListedRoom } from "../../../apps/web/shared/types";

// What the administrator reaches is not what his everyday lists hold (docs/web.md, 「Access」): his room list holds
// his own rooms and the deployment's — added in a mode or allowed by the owner — and never another account's private
// room, a room only another account reads, or a sealed one, though he still reads each of them by its address. A
// member's list is the rooms they read, as before. A room message rings only the devices of an account whose list
// holds the room.

const ADMIN = 1;
const MEMBER = 2;

// The administrator's own console room; a room added in a mode and one the owner allowed, the deployment's; the
// member's private room with their BMO and a room they opened; a sealed room added in a mode.
const OWN = -11;
const IN_MODE = -12;
const ALLOWED = -13;
const MEMBER_PRIVATE = -21;
const MEMBER_ROOM = -22;
const SEALED = -23;

const ROOMS = [
  { id: OWN, mode: null, listened: false, supervisors: ["agent-a"], privateOf: null, sealed: false },
  { id: IN_MODE, mode: "talk", listened: false, supervisors: [], privateOf: null, sealed: false },
  { id: ALLOWED, mode: null, listened: true, supervisors: [], privateOf: null, sealed: false },
  { id: MEMBER_PRIVATE, mode: "talk", listened: false, supervisors: ["u2"], privateOf: MEMBER, sealed: false },
  { id: MEMBER_ROOM, mode: null, listened: false, supervisors: ["u2"], privateOf: null, sealed: false },
  { id: SEALED, mode: "talk", listened: false, supervisors: [], privateOf: null, sealed: true }
].map((room) => ({ ...room, title: `room ${room.id}`, ownerRoom: false, pinned: false, senders: [], messageCount: 1, lastMessageAt: 1_700_000_000_000 }));

const MEMBERSHIPS: Record<number, number[]> = { [ADMIN]: [OWN], [MEMBER]: [MEMBER_PRIVATE, MEMBER_ROOM] };

standIn("WEB_SERVER", (one) => {
  const user = Number(/^\/users\/(\d+)$/.exec(one.path.split("?")[0] ?? "")?.[1]);

  if (Number.isSafeInteger(user)) return answer({ user: String(user), name: `account-${user}`, administrator: user === ADMIN, senders: [] });
  if (one.path.startsWith("/users")) {
    return answer({ users: [ADMIN, MEMBER].map((id) => ({ user: String(id), name: `account-${id}`, fullName: "", administrator: id === ADMIN })) });
  }

  return answer({ code: "failed", error: "Not served here." }, 500);
});

standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";
  const account = Number(/^\/accounts\/(\d+)\/rooms$/.exec(path)?.[1]);

  if (path === "/owner") return answer({ room: null, senderId: null });
  if (path === "/rooms") return answer({ items: ROOMS, more: false });
  if (Number.isSafeInteger(account)) return answer({ rooms: MEMBERSHIPS[account] ?? [] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

const signedIn = await import("../../../apps/web/server/utils/accounts");
const reach = await import("../../../apps/web/server/utils/room-reach");
const consoleRooms = await import("../../../apps/web/server/utils/console-rooms");
const { RoomHearers, listedRoomsOf } = await import("../../../apps/web/server/utils/room-hearers");

globalsRestoredAfter(["requireUserSession", "getUserSession", "signedInUser", "unreadCounts", "ownSenders", "changeJudge", ...Object.keys(reach), ...Object.keys(consoleRooms)]);

// The room list route reads its reach and the rooms' privacies as the server's own imports.
Object.assign(globals, reach, consoleRooms);
globals.requireUserSession = async () => session;
globals.getUserSession = async () => session;
globals.signedInUser = signedIn.signedInUser;
// The counts and whether a room may be changed are their own modules' to test; here every room counts none.
globals.unreadCounts = async () => new Map();
globals.ownSenders = async () => [];
globals.changeJudge = () => async () => true;

const AS_ADMIN = { user: { name: `account-${ADMIN}`, id: ADMIN }, sid: "bmo.sid=admin", administrator: true };
const AS_MEMBER = { user: { name: `account-${MEMBER}`, id: MEMBER }, sid: "bmo.sid=member", administrator: false };

const rooms = await routeOf<ListedRoom[]>("../../apps/web/server/api/rooms.get");
const listed = async (): Promise<number[]> => {
  const said = await asked(rooms, {});

  if (said.answer === null) throw new Error(`${said.status} ${said.message}`);

  return said.answer.map((room) => room.chatId);
};

describe("the administrator's room list", () => {
  test("holds his own rooms and the deployment's, and no room of another account's nor a sealed one", async () => {
    session = AS_ADMIN;

    expect(await listed()).toEqual([OWN, IN_MODE, ALLOWED]);
  });

  test("leaves his reach as it was: every room left out of the list still reads by its address", async () => {
    session = AS_ADMIN;

    for (const room of [MEMBER_PRIVATE, MEMBER_ROOM, SEALED]) await reach.requireReadableRoom({ context: {} } as never, room);
  });

  test("is a member's own rooms alone, as before", async () => {
    session = AS_MEMBER;

    expect(await listed()).toEqual([MEMBER_PRIVATE, MEMBER_ROOM]);
  });
});

describe("a room message rings", () => {
  const hearers = new RoomHearers({
    users: async () => [ADMIN, MEMBER].map((id) => ({ user: String(id), name: `account-${id}`, administrator: id === ADMIN })),
    listed: listedRoomsOf,
    now: () => 0,
    holdMs: 60_000
  });

  test("the devices of the accounts whose room list holds the room alone", async () => {
    const heard = async (room: number) => [await hearers.hears(`account-${ADMIN}`, room), await hearers.hears(`account-${MEMBER}`, room)];

    expect(await heard(OWN)).toEqual([true, false]);
    expect(await heard(IN_MODE)).toEqual([true, false]);
    expect(await heard(MEMBER_PRIVATE)).toEqual([false, true]);
    expect(await heard(MEMBER_ROOM)).toEqual([false, true]);
  });

  test("a console login the account service does not name as the administrator", async () => {
    expect(await hearers.hears("console-login", IN_MODE)).toBe(true);
    expect(await hearers.hears("console-login", MEMBER_ROOM)).toBe(false);
  });
});
