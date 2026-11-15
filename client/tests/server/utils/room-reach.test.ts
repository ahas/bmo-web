import { afterAll, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { standInAccountService } from "../../support/account-service";
import { ROOM_ID } from "../../support/ids";
import { answer, standIn } from "../../support/units";

// The rooms a user other than the administrator reads on the console (docs/web.md, 「Access」), by their account: their
// console memberships, the rooms their linked identities reach and hold the console grant in, and their own BMO's
// private room, and nothing else. The account service answers the user's senders and the grant; the receiver answers
// the rooms with the senders that have stood in each, an account's memberships and a room's accounts; the agency
// answers whose BMO each supervisor is.

const member = 77;
// An account made by an invitation, with no chat service's identity at all, and a colleague it lets in.
const invited = 3;
const colleague = 4;
const PRIVATE = -50;
const GROUP = -51;

const service = standInAccountService({
  users: [
    { id: 2, name: "member", senders: [member] },
    { id: invited, name: "invited" },
    { id: colleague, name: "colleague" }
  ],
  grants: [
    { object: String(ROOM_ID), relation: "console", subject: "user:2" },
    { object: String(member), relation: "console", subject: "user:2" },
    { object: "-310", relation: "console", subject: "user:2" },
    { object: "-320", relation: "console", subject: "user:2" }
  ]
});

// The console memberships the receiver holds now, by account, each account's private rooms among them; a test lets a
// person in or takes them out here.
const memberships = new Map<number, number[]>([[invited, [GROUP, PRIVATE]]]);
const roomAccounts = new Map<number, number[]>([[PRIVATE, [invited]]]);

// The receiver's room list: the member has spoken in the room and in -300, someone else in -200, and the
// member's own private room is theirs. The member has spoken too, holding the grant, in a sealed room (-310) and in
// the invited account's private room (-320), neither of which is theirs to read. The invited account's memberships hold its BMO's private room and the group
// room it opened.
// A read of an account's memberships may be held after it is answered and before the answer goes, as a slow receiver
// holds it; `membershipReads` counts the reads.
let held: Promise<void> | null = null;
let membershipReads = 0;

const receiver = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    const account = path.match(/^\/accounts\/(\d+)\/rooms$/)?.[1];
    const room = path.match(/^\/rooms\/(-?\d+)\/accounts$/);

    if (path === "/rooms") {
      return Response.json({
        items: [ROOM_ID, -300, -200, member, -310, -320].map((id) => ({
          id,
          title: null,
          messageCount: 1,
          lastMessageAt: 1,
          pinned: false,
          senders: id === -200 ? [5] : [member],
          supervisors: [],
          ownerRoom: id === member,
          registered: true,
          workRoom: 0,
          privateOf: id === -320 ? invited : null,
          sealed: id === -310
        })),
        more: false
      });
    }
    if (account !== undefined) {
      const rooms = memberships.get(Number(account)) ?? [];

      membershipReads += 1;
      await held;

      return Response.json({ rooms });
    }
    if (room !== null) {
      const id = Number(room[1]);
      const held = roomAccounts.get(id) ?? [...memberships].filter(([, rooms]) => rooms.includes(id)).map(([one]) => one);

      return Response.json({ accounts: [...new Set(held)].map((one) => ({ account: String(one) })) });
    }

    return Response.json({ error: "no such route", code: "not-found" }, { status: 404 });
  }
});

standIn("AGENCY", () => answer({ items: [{ name: `u${invited}`, label: "invited's BMO", ownerAccount: invited }] }));

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;
process.env.RECEIVER_ADDRESS = `http://127.0.0.1:${receiver.port}`;

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["createError", "fail", "requireUserSession"]);
globals.requireUserSession = async () => session;
globals.createError = (error: { statusCode: number; statusMessage?: string; message?: string }) =>
  Object.assign(new Error(error.statusMessage ?? error.message), error);
globals.fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

const { LiveRooms, ownRooms, readableRooms, requireReadableRoom, roomReachChanged } = await import("../../../apps/web/server/utils/room-reach");

// The addresses are the whole suite's environment, so they go with the stand-ins that answered them.
afterAll(async () => {
  service.stop();
  await receiver.stop(true);
  delete process.env.WEB_SERVER_ADDRESS;
  delete process.env.RECEIVER_ADDRESS;
});

const event = () => ({ context: {} }) as never;
const signedAs = (id: number, name: string) => {
  session = { user: { name, id }, sid: `bmo.sid=${name}`, administrator: false };
};
const read = async () => [...((await readableRooms(event())) as Set<number>)].sort((a, b) => a - b);
const status = async (room: number) => await requireReadableRoom(event(), room).then(() => 200, (error: { statusCode: number }) => error.statusCode);

describe("the rooms a user reads on the console", () => {
  test("for a person reached through a messenger with no console membership, are exactly the rooms their identities reach", async () => {
    signedAs(2, "member");

    expect(await read()).toEqual([ROOM_ID, member]);

    for (const absent of [-200, -300, -310, -320, PRIVATE, GROUP]) {
      expect(await status(absent)).toBe(404);
    }
  });

  test("for an account with no messenger identity, are its own BMO's private room and the group room it opened", async () => {
    signedAs(invited, "invited");

    expect(await read()).toEqual([GROUP, PRIVATE]);
  });

  test("for a person let in, hold the room, never its opener's private room, and stop holding it once they are taken out", async () => {
    signedAs(colleague, "colleague");
    memberships.set(colleague, [GROUP]);

    expect(await read()).toEqual([GROUP]);
    expect(await status(PRIVATE)).toBe(404);

    memberships.set(colleague, []);

    expect(await read()).toEqual([]);
    expect(await status(GROUP)).toBe(404);
  });

  test("are every room for the administrator", async () => {
    session = { user: { name: "boss", id: 1 }, sid: "bmo.sid=boss", administrator: true };

    expect(await readableRooms(event())).toBe("all");
  });

  test("hold the owner's private chat as the administrator's own only where the receiver says it is his account's", async () => {
    const boss = { name: "boss", id: 1, administrator: true };

    memberships.set(1, []);
    expect([...(await ownRooms(boss))]).toEqual([]);

    memberships.set(1, [member]);
    expect([...(await ownRooms(boss))]).toEqual([member]);
    memberships.delete(1);
  });
});

describe("the rooms an open stream hears", () => {
  // Who the stream's login is each time it is asked, as the seal and the account model answer it now.
  let standing: () => Promise<{ name: string; id: number | null; administrator: boolean }>;
  let lost = 0;

  const live = async (id: number, name: string) => {
    signedAs(id, name);
    standing = async () => ({ name, id, administrator: false });
    lost = 0;

    const rooms = new LiveRooms({ name, id, administrator: false }, await readableRooms(event()), async () => await standing());

    return { rooms, stop: rooms.follow(() => (lost += 1), 60_000) };
  };

  test("fall silent on a room the moment its account is taken out of it, before the rooms are read again", async () => {
    memberships.set(colleague, [GROUP]);

    const { rooms, stop } = await live(colleague, "colleague");

    expect(rooms.has(GROUP)).toBe(true);

    memberships.set(colleague, []);
    roomReachChanged({ account: colleague, room: GROUP, left: true });

    expect(rooms.has(GROUP)).toBe(false);
    await rooms.settled();
    expect(rooms.has(GROUP)).toBe(false);
    stop();
  });

  test("hear a room once its account is let in, and nothing of another account's change", async () => {
    memberships.set(colleague, []);

    const { rooms, stop } = await live(colleague, "colleague");

    memberships.set(colleague, [GROUP]);
    roomReachChanged({ account: invited, room: GROUP, left: false });
    await rooms.settled();
    expect(rooms.has(GROUP)).toBe(false);

    roomReachChanged({ account: colleague, room: GROUP, left: false });
    await rooms.settled();
    expect(rooms.has(GROUP)).toBe(true);
    stop();

    // A stream that has ended follows nothing more.
    memberships.set(colleague, []);
    roomReachChanged({ account: colleague, room: GROUP, left: true });
    expect(rooms.has(GROUP)).toBe(true);
  });

  test("keep a dropped room out though a read begun before the drop lands after it", async () => {
    memberships.set(colleague, [GROUP]);

    const { rooms, stop } = await live(colleague, "colleague");
    let release: () => void = () => undefined;

    // A read that took the memberships while the account still held the room, held until the take-out is said.
    held = new Promise((resolve) => (release = resolve));

    const before = membershipReads;

    roomReachChanged({ account: colleague, room: -300, left: false });

    for (let tries = 0; tries < 100 && membershipReads === before; tries += 1) await Bun.sleep(5);

    memberships.set(colleague, []);
    roomReachChanged({ account: colleague, room: GROUP, left: true });

    // The early read lands while the one begun after the take-out is held in its turn.
    const first = release;

    held = new Promise((resolve) => (release = resolve));
    first();

    for (let tries = 0; tries < 100 && membershipReads < before + 2; tries += 1) await Bun.sleep(5);

    expect(membershipReads).toBe(before + 2);
    expect(rooms.has(GROUP)).toBe(false);

    held = null;
    release();
    await rooms.settled();
    expect(rooms.has(GROUP)).toBe(false);
    stop();
  });

  test("end where a read of the rooms cannot be made, and hear no room from then on", async () => {
    memberships.set(colleague, [GROUP]);

    const { rooms, stop } = await live(colleague, "colleague");

    standing = async () => {
      throw new Error("the login no longer stands");
    };
    roomReachChanged({ account: colleague, room: -300, left: false });
    await rooms.settled();

    expect(lost).toBe(1);
    expect(rooms.has(GROUP)).toBe(false);

    // A later read that would say the room stands changes nothing.
    standing = async () => ({ name: "colleague", id: colleague, administrator: false });
    roomReachChanged({ account: colleague, room: -300, left: false });
    await rooms.settled();
    expect(rooms.has(GROUP)).toBe(false);
    stop();
  });

  test("of the administrator end once his login is no longer the administrator's, and not before", async () => {
    signedAs(1, "boss");
    lost = 0;

    let administrator = true;
    const rooms = new LiveRooms({ name: "boss", id: 1, administrator: true }, "all", async () => ({ name: "boss", id: 1, administrator }));
    const stop = rooms.follow(() => (lost += 1), 20);

    await Bun.sleep(60);
    await rooms.settled();
    expect([lost, rooms.has(PRIVATE)]).toEqual([0, true]);

    administrator = false;

    for (let tries = 0; tries < 100 && lost === 0; tries += 1) await Bun.sleep(5);

    expect([lost, rooms.has(PRIVATE)]).toEqual([1, false]);
    stop();
  });
});
