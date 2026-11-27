import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { onConsoleEvent } from "../../../apps/web/server/utils/console-events";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { UnitChoice } from "../../../apps/web/shared/people";

// Several people let into a room at once (docs/web.md, the room screen's section on opening a room and letting people
// in): the people chosen and the people of each organisation chosen — those whose home unit it is and those holding a
// post in it, the units under it not taken in — those already members and those whose accounts have left passed
// over. Any member who writes there lets people in, as the account service answers letting in; one refused refuses
// the whole; the receiver is told each organisation in a call of its own and the people beside them in one more, and
// each person let in is told, by their account alone, that their rooms changed.

const READER = 3;
const COLLEAGUE = 4;
const TEAMMATE = 7;
const POSTED = 8;
const GONE = 9;
const OUTSIDER = 6;
const GROUP = -51;

const COMPANY = 1;
const TEAM = 2;
const PART = 3;
const OTHER_COMPANY = 10;

// The reader's company holds the team the reader stands in and a part under it; another company holds the outsider.
// A person whose account left still stands in the team, as the account service lists it.
const units = [
  { id: COMPANY, name: "company-a", heads: [], members: [String(COLLEAGUE)], concurrent: [], acting: [], left: [] },
  { id: TEAM, name: "team-a", parent: COMPANY, heads: [], members: [String(READER), String(TEAMMATE), String(GONE)], concurrent: [], acting: [], left: [String(GONE)] },
  { id: PART, name: "part-a", shortName: "zq", parent: TEAM, heads: [], members: [], concurrent: [String(POSTED)], acting: [], left: [] },
  { id: OTHER_COMPANY, name: "company-b", heads: [], members: [String(OUTSIDER)], concurrent: [], acting: [], left: [] }
];

const members = new Set([String(READER)]);

// The receiver lets in whoever is not a member yet and answers whom it let in; for an organisation it passes over
// the accounts that have left.
function letIn(keys: readonly string[]): number[] {
  const fresh = keys.filter((key) => !members.has(key));

  for (const key of fresh) members.add(key);

  return fresh.map(Number);
}

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/rooms") return answer({ items: [{ id: GROUP, title: null, privateOf: null }], more: false });
  if (path === `/supervisors/u${READER}/rooms`) return answer({ items: [{ id: GROUP, title: null, named: true, alone: true }], more: false });
  if (path === `/accounts/${READER}/rooms`) return answer({ rooms: [GROUP] });
  if (path === `/rooms/${GROUP}`) return answer({ id: GROUP, title: null, privateOf: null });
  // The group is a room the console made: the record alone carries it.
  if (path === `/rooms/${GROUP}/providers`) return answer({ providers: ["record"], chosen: false, fileLimit: null });
  if (path === `/rooms/${GROUP}/accounts` && one.method === "POST") {
    return answer({ accounts: [], letIn: letIn((one.body?.accounts as number[]).map(String)) });
  }
  if (path === `/rooms/${GROUP}/unit-accounts` && one.method === "POST") {
    const unit = units.find((row) => row.id === one.body?.unit)!;

    return answer({ unit: unit.id, unitName: unit.name, accounts: [], letIn: letIn([...unit.members, ...unit.concurrent].filter((key) => !new Set<string>(unit.left).has(key))) });
  }
  if (path === `/rooms/${GROUP}/accounts`) return answer({ accounts: [...members].map((key) => ({ account: key })) });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

standIn("AGENCY", () => answer({ items: [{ name: `u${READER}`, label: "reader's BMO", ownerAccount: READER }] }));

const accounts = standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: false, senders: [] });
  if (one.path === "/units") return answer({ units });
  if (one.path === "/checks/entry") {
    // The outsider stands in another company, and an account that has left is let in nowhere.
    const allowed = one.body?.actor === String(READER) && ![String(OUTSIDER), String(GONE)].includes(String(one.body?.user));

    return answer({ allowed, grant: `bmo_room:${String(one.body?.room)}#entry`, user: one.body?.user });
  }

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => ({ user: { name: `account-${READER}`, id: READER }, sid: `bmo.sid=${READER}`, administrator: false });
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const letInMany = await routeOf<void>("../../apps/web/server/api/rooms/[chatId]/accounts/index.post");
const findUnits = await routeOf<UnitChoice[]>("../../apps/web/server/api/people/units.get");

const writes = () => receiver.asked.filter((one) => one.method !== "GET").map((one) => [one.method, one.path, one.body]);

const reset = () => {
  members.clear();
  members.add(String(READER));
  receiver.asked.length = 0;
  accounts.asked.length = 0;
};

// What the account service was asked to write: nothing, since membership is the call right.
const serviceWrites = () => accounts.asked.filter((one) => one.method === "PUT" || one.method === "DELETE");

describe("people let into a room at once", () => {
  test("finds the organisations of the reader's company alone, each with the units above it and its people who have not left", async () => {
    expect((await asked(findUnits, { query: { q: "-a" } })).answer).toEqual([
      { id: COMPANY, name: "company-a", shortName: null, path: [], people: 1 },
      { id: TEAM, name: "team-a", shortName: null, path: ["company-a"], people: 2 },
      { id: PART, name: "part-a", shortName: "zq", path: ["company-a", "team-a"], people: 1 }
    ]);
  });

  test("finds an organisation by its short name too, as the rows' search reads it", async () => {
    expect((await asked(findUnits, { query: { q: "ZQ" } })).answer).toEqual([{ id: PART, name: "part-a", shortName: "zq", path: ["company-a", "team-a"], people: 1 }]);
  });

  test("an organisation goes to the receiver in a call of its own, its departed account never asked about, and nothing is written on the account service", async () => {
    reset();

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { units: [TEAM] } })).status).toBe(200);
    expect(writes()).toEqual([["POST", `/rooms/${GROUP}/unit-accounts`, { unit: TEAM, by: READER }]]);
    expect(serviceWrites()).toEqual([]);
  });

  test("people beside an organisation go in one more call, those it already took in left out", async () => {
    reset();

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { accounts: [String(COLLEAGUE), String(POSTED)], units: [PART] } })).status).toBe(200);
    expect(writes()).toEqual([
      ["POST", `/rooms/${GROUP}/unit-accounts`, { unit: PART, by: READER }],
      ["POST", `/rooms/${GROUP}/accounts`, { accounts: [COLLEAGUE], by: READER }]
    ]);
    // Membership is the call right, so nobody let in is granted anything on the account service.
    expect(serviceWrites()).toEqual([]);
  });

  test("an organisation whose people are all members already is not asked of the receiver", async () => {
    reset();
    members.add(String(POSTED));

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { units: [PART] } })).status).toBe(200);
    expect(writes()).toEqual([]);
  });

  test("asks the account service about letting in, and tells each person let in alone that their rooms changed", async () => {
    reset();

    const said: unknown[] = [];
    const stop = onConsoleEvent((one) => said.push(one));

    try {
      expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { accounts: [String(COLLEAGUE), String(TEAMMATE)] } })).status).toBe(200);
    } finally {
      stop();
    }

    const checks = accounts.asked.filter((one) => one.path === "/checks/entry").map((one) => one.body);

    // Both people are checked in parallel and told in parallel, so which line the stand-in records first is
    // timing; what the route promises is that each was checked and each told alone, whichever order they land in.
    const ofUser = (one: unknown) => {
      const row = one as { user?: unknown; data?: { account?: unknown } };

      return Number(row.user ?? row.data?.account);
    };

    expect([...checks].sort((a, b) => ofUser(a) - ofUser(b))).toEqual(
      [
        { room: GROUP, actor: String(READER), user: String(COLLEAGUE), act: "let-in" },
        { room: GROUP, actor: String(READER), user: String(TEAMMATE), act: "let-in" }
      ].sort((a, b) => Number(a.user) - Number(b.user))
    );
    expect([...said].sort((a, b) => ofUser(a) - ofUser(b))).toEqual(
      [
        { name: "rooms", data: { account: COLLEAGUE } },
        { name: "rooms", data: { account: TEAMMATE } }
      ].sort((a, b) => a.data.account - b.data.account)
    );
  });

  test("one person refused refuses the whole, and an organisation of another company is refused", async () => {
    reset();

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { accounts: [String(COLLEAGUE), String(OUTSIDER)] } })).status).toBe(403);
    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { units: [OTHER_COMPANY] } })).status).toBe(403);
    expect(writes()).toEqual([]);
  });
});
