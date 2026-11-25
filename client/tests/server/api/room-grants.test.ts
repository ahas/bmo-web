import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomGrants, RoomMembersView } from "../../../apps/web/shared/types";

// A member's rights in a room (docs/web.md, the room screen's members entry): the receiver keeps them beside the
// membership and says of its own accord whose standing in the room writes them, so the console asks one member's read
// before the rest, folds what it is told into the members read, and hands each change straight on. A receiver that
// a rights read that cannot be made leaves the members tab with none at all (docs/boundary.md, 「Gaps the console
// meets」), and
// a refusal the receiver answers with stands in the pack's own sentence. The signed-in login is the harness's
// administrator, whose account is 1.

const ROOM = -70;
const PRIVATE = -71;
const BY = "1";
const FIRST = "7";
const SECOND = "12";
const OUTSIDER = "13";

// What the receiver keeps: whose writing it accepts, how it answers the rights read when it is asked for none, and the
// rights of each member.
let serves: { code: string; status: number } | null = null;
let accepts = true;
const rights = new Map<string, RoomGrants>([
  [FIRST, { letIn: false, takeOut: true }],
  [SECOND, { letIn: true, takeOut: false }]
]);

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";
  const query = new URLSearchParams(one.path.split("?")[1] ?? "");
  const granted = path.match(/^\/rooms\/(-?\d+)\/accounts\/(\d+)\/grants$/);

  // Whose private room each room is: -71 is an account's own, every other room no one's.
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: path === `/rooms/${PRIVATE}` ? 9 : null, sealed: false });
  if (path === `/rooms/${ROOM}/accounts` || path === `/rooms/${PRIVATE}/accounts`) {
    return answer({ accounts: [{ account: FIRST, addedBy: BY, addedAt: 1 }, { account: SECOND, addedBy: FIRST, addedAt: 2 }] });
  }
  if (path === `/rooms/${ROOM}/members`) return answer({ members: [] });
  if (path === `/rooms/${PRIVATE}/members`) return answer({ members: [] });

  if (granted === null) return answer({ code: "failed", error: "Not served here." }, 500);
  if (one.method === "GET" && serves !== null) return answer({ code: serves.code, error: "Not served here." }, serves.status);
  if (query.get("by") !== BY && one.method === "GET") return answer({ code: "bad-request", error: "by is the asking account." }, 400);

  const held = rights.get(granted[2]!) ?? { letIn: false, takeOut: false };

  if (one.method === "GET") return answer({ account: granted[2], ...held, mayWrite: accepts });

  // Only the administrator, the room's leader and a head of the leader's unit write a member's rights.
  if (!accepts) return answer({ code: "not-room-leader", error: "The reader does not lead this room." }, 403);

  const right = one.method === "PUT" ? String(one.body?.right ?? "") : query.get("right") ?? "";

  if (right !== "let-in" && right !== "take-out") return answer({ code: "bad-request", error: "right names one right." }, 400);

  const now = right === "let-in" ? { ...held, letIn: true } : { ...held, takeOut: true };

  if (one.method === "DELETE") {
    rights.set(granted[2]!, right === "let-in" ? { ...now, letIn: false } : { ...now, takeOut: false });

    return new Response(null, { status: 204 });
  }

  rights.set(granted[2]!, now);

  return answer({ account: granted[2], ...now });
});

const accounts = standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  // The signed-in login (user 1) is the platform administrator; every other account is not.
  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: user === BY, senders: [] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

// The signed-in login is read from the session the harness stands, as every route reads it.
const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => session;
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const signedIn = (id: number | null) => {
  session = id === null ? { user: { name: "owner" } } : { user: { name: `account-${id}`, id }, sid: `bmo.sid=${id}`, administrator: true };
};

signedIn(Number(BY));

const read = await routeOf<RoomMembersView>("../../apps/web/server/api/rooms/[chatId]/members.get");
const give = await routeOf<RoomGrants>("../../apps/web/server/api/rooms/[chatId]/accounts/[user]/grants.put");
const take = await routeOf<void>("../../apps/web/server/api/rooms/[chatId]/accounts/[user]/grants.delete");

const grants = () => receiver.asked.filter((one) => one.path.includes("/grants")).map((one) => [one.method, one.path, one.body]);

describe("a member's rights in a room", () => {
  test("stand beside each member the console knows as an account, with the reader's own standing beside them", async () => {
    receiver.asked.length = 0;

    const view = (await asked(read, { params: { chatId: String(ROOM) } })).answer!;

    expect(view.mayGrant).toBe(true);
    expect(view.members.map((member) => [member.account, member.grants])).toEqual([
      [FIRST, { letIn: false, takeOut: true }],
      [SECOND, { letIn: true, takeOut: false }]
    ]);
    // The room's people are the accounts the receiver keeps; the reader is asked for as the one writing.
    expect(grants()).toEqual([
      ["GET", `/rooms/${ROOM}/accounts/${FIRST}/grants?by=${BY}`, null],
      ["GET", `/rooms/${ROOM}/accounts/${SECOND}/grants?by=${BY}`, null]
    ]);
  });

  test("where the receiver takes no writing from the reader, are not read for anyone and stand nowhere", async () => {
    accepts = false;
    receiver.asked.length = 0;

    const view = (await asked(read, { params: { chatId: String(ROOM) } })).answer!;

    expect(view.mayGrant).toBe(false);
    expect(view.members.every((member) => member.grants === null)).toBe(true);
    // One read says whether this reader writes here at all; the rest are asked only where it does.
    expect(grants()).toEqual([["GET", `/rooms/${ROOM}/accounts/${FIRST}/grants?by=${BY}`, null]]);
    accepts = true;
  });

  // A rights read that cannot be made says nothing of anyone, so the members stand and no control does; which of the
  // receiver's own answers it is does not matter, and the members read is never the one to fail.
  for (const unserved of [{ code: "no-route", status: 404 }, { code: "not-found", status: 404 }, { code: "failed", status: 500 }]) {
    test(`where the rights read answers ${unserved.code}, leave the members standing with no rights and no failure`, async () => {
      serves = unserved;
      receiver.asked.length = 0;

      const askedRead = await asked(read, { params: { chatId: String(ROOM) } });

      expect(askedRead.status).toBe(200);
      expect(askedRead.answer?.members.map((member) => member.account)).toEqual([FIRST, SECOND]);
      expect(askedRead.answer?.mayGrant).toBe(false);
      expect(askedRead.answer?.members.map((member) => member.grants)).toEqual([null, null]);
      // One read asks whether this reader writes here at all; nothing else is asked when it cannot say.
      expect(grants()).toEqual([["GET", `/rooms/${ROOM}/accounts/${FIRST}/grants?by=${BY}`, null]]);

      serves = null;
    });
  }

  test("of a room whose people the console keeps as they stand are not asked for at all", async () => {
    receiver.asked.length = 0;

    const view = (await asked(read, { params: { chatId: String(PRIVATE) } })).answer!;

    expect(view.mayGrant).toBe(false);
    expect(view.members.every((member) => member.grants === null)).toBe(true);
    expect(grants()).toEqual([]);
  });

  test("are given by the route naming the right, the receiver keeping them and the member's rights answering", async () => {
    receiver.asked.length = 0;

    const wrote = await asked(give, { params: { chatId: String(ROOM), user: FIRST }, body: { right: "let-in" } });

    expect(wrote.status).toBe(200);
    expect(wrote.answer).toEqual({ letIn: true, takeOut: true });
    expect(grants()).toEqual([["PUT", `/rooms/${ROOM}/accounts/${FIRST}/grants`, { by: Number(BY), right: "let-in" }]]);
    expect(accounts.asked.filter((one) => one.method === "PUT" || one.method === "DELETE")).toEqual([]);

    // The right stands for the member from then on, whoever reads the list next.
    expect((await asked(read, { params: { chatId: String(ROOM) } })).answer?.members[0]?.grants).toEqual({ letIn: true, takeOut: true });

    rights.set(FIRST, { letIn: false, takeOut: true });
  });

  test("are taken back by the route naming the right, the receiver putting down its row", async () => {
    receiver.asked.length = 0;

    expect((await asked(take, { params: { chatId: String(ROOM), user: FIRST }, query: { right: "take-out" } })).status).toBe(200);
    expect(grants()).toEqual([["DELETE", `/rooms/${ROOM}/accounts/${FIRST}/grants?by=${BY}&right=take-out`, null]]);
    expect(rights.get(FIRST)).toEqual({ letIn: false, takeOut: false });

    rights.set(FIRST, { letIn: false, takeOut: true });
  });

  test("refused by the receiver for a reader whose standing does not reach it, are said by the pack's sentence and stand as they were", async () => {
    accepts = false;
    receiver.asked.length = 0;

    const refused = await asked(give, { params: { chatId: String(ROOM), user: SECOND }, body: { right: "take-out" } });

    expect(refused.status).toBe(403);
    expect(refused.message).toBe(wording("members.error.grant_forbidden"));
    expect(rights.get(SECOND)).toEqual({ letIn: true, takeOut: false });
    accepts = true;
  });

  test("asked for with no right the routes know, or for anyone the console does not keep as an account, are refused and reach nobody", async () => {
    for (const right of [undefined, "", "letIn", "everything"]) {
      receiver.asked.length = 0;

      expect((await asked(give, { params: { chatId: String(ROOM), user: FIRST }, body: { right } })).status).toBe(400);
      expect(grants()).toEqual([]);
    }

    receiver.asked.length = 0;

    expect((await asked(give, { params: { chatId: String(ROOM), user: "seven" }, body: { right: "let-in" } })).status).toBe(400);
    expect((await asked(take, { params: { chatId: String(ROOM), user: OUTSIDER } })).status).toBe(400);
    expect(grants()).toEqual([]);
  });

  test("are beyond a login standing before the account model, which holds no account to write them as", async () => {
    signedIn(null);
    receiver.asked.length = 0;

    expect((await asked(give, { params: { chatId: String(ROOM), user: FIRST }, body: { right: "let-in" } })).status).toBe(403);
    expect((await asked(take, { params: { chatId: String(ROOM), user: FIRST }, query: { right: "let-in" } })).status).toBe(403);
    expect(grants()).toEqual([]);

    signedIn(Number(BY));
  });
});
