import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomAdded, RoomOverlay, SentMessage } from "../../../apps/web/shared/types";

// An account with no chat service's identity in the console (docs/web.md, the room screen's section on opening a room
// and letting people in): it speaks in its own BMO's private room, opens a group room naming its own BMO, lets a
// person of its own company in with the call granted at the same moment — never one of another company — and takes
// them out again. The account service says who may let whom in; the receiver keeps the members.

const INVITED = 3;
const COLLEAGUE = 4;
const OUTSIDER = 6;
const PRIVATE = -50;
const GROUP = -51;

// The receiver's members by account, as the stand-in keeps them.
const members = new Map<number, Set<string>>([[GROUP, new Set([String(INVITED)])]]);

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";
  const account = path.match(/^\/rooms\/(-?\d+)\/accounts\/(\d+)$/);

  // The receiver reads the opener and the one letting in as numbers, and refuses anything else.
  if (path === "/rooms" && one.method === "POST") {
    return typeof one.body?.openedBy === "number" ? answer({ id: GROUP, title: one.body.title ?? null }, 201) : answer({ code: "bad-request", error: "openedBy is a number." }, 400);
  }
  if (account !== null && one.method === "PUT" && typeof one.body?.by !== "number") return answer({ code: "bad-request", error: "by is a number." }, 400);
  // The room list says whose private room each room is; the invited account's BMO answers both rooms.
  if (path === "/rooms") return answer({ items: [GROUP, PRIVATE].map((id) => ({ id, title: null, privateOf: id === PRIVATE ? INVITED : null })), more: false });
  if (path === `/supervisors/u${INVITED}/rooms`) return answer({ items: [GROUP, PRIVATE].map((id) => ({ id, title: null, named: true, alone: true })), more: false });
  if (account !== null && one.method === "PUT") {
    members.get(Number(account[1]))?.add(account[2]!);
    return answer({ account: account[2], addedBy: one.body?.by, addedAt: 1 });
  }
  if (account !== null && one.method === "DELETE") {
    members.get(Number(account[1]))?.delete(account[2]!);
    return new Response(null, { status: 204 });
  }
  // The account's memberships, its own BMO's private room among them.
  if (path === `/accounts/${INVITED}/rooms`) return answer({ rooms: [GROUP, PRIVATE] });
  // Whose private room each room is, as the receiver says it: the private room is the invited account's.
  if (/^\/rooms\/-?\d+$/.test(path)) {
    const room = Number(path.split("/")[2]);

    return answer({ id: room, title: null, privateOf: room === PRIVATE ? INVITED : null });
  }
  if (/^\/rooms\/-?\d+\/accounts$/.test(path)) {
    const room = Number(path.split("/")[2]);

    return answer({ accounts: [...(members.get(room) ?? [])].map((key) => ({ account: key })) });
  }
  if (/^\/rooms\/-?\d+\/words$/.test(path)) return answer({ id: 31 }, 201);

  return answer({ code: "failed", error: "Not served here." }, 500);
});

// The invited account owns the BMO `u3`; the account `5` owns none.
standIn("AGENCY", () => answer({ items: [{ name: `u${INVITED}`, label: "invited's BMO", ownerAccount: INVITED }] }));

// The colleague stands in the invited account's company, the outsider in another.
const accounts = standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: false, senders: [] });
  if (one.path === "/checks/entry") {
    const allowed = one.body?.actor === String(INVITED) && [String(INVITED), String(COLLEAGUE)].includes(String(one.body?.user));

    return answer({ allowed, grant: `bmo_room:${String(one.body?.room)}#entry`, user: one.body?.user });
  }
  if (/^\/rooms\/-?\d+\/callers\/\d+$/.test(one.path)) return new Response(null, { status: 204 });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => session;
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const signedAs = (id: number) => {
  session = { user: { name: `account-${id}`, id }, sid: `bmo.sid=${id}`, administrator: false };
};

const open = await routeOf<RoomAdded>("../../apps/web/server/api/rooms.post");
const say = await routeOf<SentMessage>("../../apps/web/server/api/rooms/[chatId]/say.post");
const letIn = await routeOf<void>("../../apps/web/server/api/rooms/[chatId]/accounts/[user].put");
const takeOut = await routeOf<void>("../../apps/web/server/api/rooms/[chatId]/accounts/[user].delete");
const overlay = await routeOf<RoomOverlay>("../../apps/web/server/api/rooms/[chatId]/overlay.get");

const writes = () => receiver.asked.filter((one) => one.method !== "GET").map((one) => [one.method, one.path, one.body]);

describe("an account with no chat service's identity", () => {
  test("says its words in its own BMO's private room, as its own account", async () => {
    signedAs(INVITED);
    receiver.asked.length = 0;

    expect((await asked(say, { params: { chatId: String(PRIVATE) }, body: { text: "hello" } })).answer).toEqual({ messageId: "31" });
    expect(writes()).toEqual([["POST", `/rooms/${PRIVATE}/words`, { account: INVITED, name: `account-${INVITED}`, text: "hello" }]]);
  });

  test("opens a group room naming its own BMO, itself its first member", async () => {
    signedAs(INVITED);
    receiver.asked.length = 0;

    expect((await asked(open, { body: { title: "Team" } })).answer).toEqual({ chatId: GROUP, title: "Team" });
    expect(writes()).toEqual([["POST", "/rooms", { title: "Team", supervisors: [`u${INVITED}`], openedBy: INVITED }]]);
  });

  test("opens none where it has no BMO of its own", async () => {
    signedAs(5);
    receiver.asked.length = 0;

    expect((await asked(open, { body: { title: "Team" } })).status).toBe(409);
    expect(writes()).toEqual([]);
  });

  test("lets a person of its company in, the call granted with membership, and is refused one of another company", async () => {
    signedAs(INVITED);
    receiver.asked.length = 0;
    accounts.asked.length = 0;

    expect((await asked(letIn, { params: { chatId: String(GROUP), user: String(COLLEAGUE) } })).status).toBe(200);
    expect(writes()).toEqual([["PUT", `/rooms/${GROUP}/accounts/${COLLEAGUE}`, { by: INVITED }]]);
    expect(accounts.asked.filter((one) => one.method === "PUT").map((one) => one.path)).toEqual([`/rooms/${GROUP}/callers/${COLLEAGUE}`]);
    expect(members.get(GROUP)?.has(String(COLLEAGUE))).toBe(true);

    receiver.asked.length = 0;

    expect((await asked(letIn, { params: { chatId: String(GROUP), user: String(OUTSIDER) } })).status).toBe(403);
    expect(writes()).toEqual([]);
  });

  test("takes the person out, their call grant going with them, and the person may leave by themselves", async () => {
    signedAs(INVITED);
    receiver.asked.length = 0;
    accounts.asked.length = 0;

    expect((await asked(takeOut, { params: { chatId: String(GROUP), user: String(COLLEAGUE) } })).status).toBe(200);
    expect(writes()).toEqual([["DELETE", `/rooms/${GROUP}/accounts/${COLLEAGUE}?by=${INVITED}`, null]]);
    expect(accounts.asked.filter((one) => one.method === "DELETE").map((one) => one.path)).toEqual([`/rooms/${GROUP}/callers/${COLLEAGUE}`]);
    expect(members.get(GROUP)?.has(String(COLLEAGUE))).toBe(false);

    // Leaving asks nobody whether it may.
    receiver.asked.length = 0;
    accounts.asked.length = 0;

    expect((await asked(takeOut, { params: { chatId: String(GROUP), user: String(INVITED) } })).status).toBe(200);
    expect(receiver.asked.some((one) => one.path === `/rooms/${GROUP}/accounts/${INVITED}?by=${INVITED}`)).toBe(true);
    expect(accounts.asked.some((one) => one.path === "/checks/entry")).toBe(false);
  });

  test("has its own BMO beside the group room, over the room the receiver names its private room", async () => {
    signedAs(INVITED);

    expect((await asked(overlay, { params: { chatId: String(GROUP) } })).answer).toEqual({ supervisor: `u${INVITED}`, label: "invited's BMO", room: PRIVATE });
    // Its own private room has no overlay of itself.
    expect((await asked(overlay, { params: { chatId: String(PRIVATE) } })).answer).toEqual({ supervisor: `u${INVITED}`, label: "invited's BMO", room: null });
  });
});
