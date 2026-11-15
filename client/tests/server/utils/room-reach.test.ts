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
    { object: String(member), relation: "console", subject: "user:2" }
  ]
});

// The console memberships the receiver holds now, by account; a test lets a person in or takes them out here.
const memberships = new Map<number, number[]>([[invited, [GROUP]]]);
const roomAccounts = new Map<number, number[]>([[PRIVATE, []]]);

// The receiver's room list: the member has spoken in the room and in -300, someone else in -200, and the
// member's own private room is theirs. The invited account's BMO answers its private room and the group room it
// opened alone, neither carried by a chat service.
const receiver = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    const account = path.match(/^\/accounts\/(\d+)\/rooms$/)?.[1];
    const room = path.match(/^\/rooms\/(-?\d+)\/(accounts|providers)$/);

    if (path === "/rooms") {
      return Response.json({
        items: [ROOM_ID, -300, -200, member].map((id) => ({
          id,
          title: null,
          messageCount: 1,
          lastMessageAt: 1,
          pinned: false,
          senders: id === -200 ? [5] : [member],
          supervisors: [],
          ownerRoom: id === member,
          registered: true,
          workRoom: 0
        })),
        more: false
      });
    }
    if (account !== undefined) return Response.json({ rooms: memberships.get(Number(account)) ?? [] });
    if (path === `/supervisors/u${invited}/rooms`) {
      return Response.json({ items: [PRIVATE, GROUP].map((id) => ({ id, title: null, named: true, alone: true })), more: false });
    }
    if (room?.[2] === "providers") return Response.json({ providers: [], chosen: false });
    if (room?.[2] === "accounts") {
      const id = Number(room[1]);
      const held = roomAccounts.get(id) ?? [invited, ...[...memberships].filter(([, rooms]) => rooms.includes(id)).map(([one]) => one)];

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

const { readableRooms, requireReadableRoom } = await import("../../../apps/web/server/utils/room-reach");

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

    for (const absent of [-200, -300, PRIVATE, GROUP]) {
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
});
