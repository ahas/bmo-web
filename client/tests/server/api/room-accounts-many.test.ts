import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { UnitChoice } from "../../../apps/web/shared/people";

// Several people let into a room at once (docs/web.md, the room screen's section on opening a room and letting people
// in): the people chosen and the people of each organisation chosen — those whose home unit it is and those holding a
// post in it, the units under it not taken in — those already members passed over. One refused refuses the whole; the
// receiver is told each organisation in a call of its own and the people beside them in one more.

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

// The receiver lets in whoever is not a member yet and answers whom it let in.
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
  if (path === `/rooms/${GROUP}/accounts` && one.method === "POST") {
    return answer({ accounts: [], letIn: letIn((one.body?.accounts as number[]).map(String)) });
  }
  if (path === `/rooms/${GROUP}/unit-accounts` && one.method === "POST") {
    const unit = units.find((row) => row.id === one.body?.unit)!;

    return answer({ unit: unit.id, unitName: unit.name, accounts: [], letIn: letIn([...unit.members, ...unit.concurrent]) });
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
    const allowed = one.body?.actor === String(READER) && String(one.body?.user) !== String(OUTSIDER);

    return answer({ allowed, grant: `bmo_room:${String(one.body?.room)}#entry`, user: one.body?.user });
  }
  if (/^\/rooms\/-?\d+\/callers\/\d+$/.test(one.path)) return new Response(null, { status: 204 });

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

// The calls granted, in no order: they are asked together.
const callersSet = () => accounts.asked.filter((one) => one.method === "PUT").map((one) => one.path).sort();

describe("people let into a room at once", () => {
  test("finds the organisations of the reader's company alone, each with the units above it and its people", async () => {
    expect((await asked(findUnits, { query: { q: "-a" } })).answer).toEqual([
      { id: COMPANY, name: "company-a", shortName: null, path: [], people: 1 },
      { id: TEAM, name: "team-a", shortName: null, path: ["company-a"], people: 3 },
      { id: PART, name: "part-a", shortName: "zq", path: ["company-a", "team-a"], people: 1 }
    ]);
  });

  test("finds an organisation by its short name too, as the rows' search reads it", async () => {
    expect((await asked(findUnits, { query: { q: "ZQ" } })).answer).toEqual([{ id: PART, name: "part-a", shortName: "zq", path: ["company-a", "team-a"], people: 1 }]);
  });

  test("an organisation goes to the receiver in a call of its own, and each person it let in is granted the call", async () => {
    reset();

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { units: [TEAM], caller: true } })).status).toBe(200);
    expect(writes()).toEqual([["POST", `/rooms/${GROUP}/unit-accounts`, { unit: TEAM, by: READER }]]);
    expect(callersSet()).toEqual([`/rooms/${GROUP}/callers/${TEAMMATE}`, `/rooms/${GROUP}/callers/${GONE}`].sort());
  });

  test("people beside an organisation go in one more call, those it already took in left out", async () => {
    reset();

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { accounts: [String(COLLEAGUE), String(POSTED)], units: [PART], caller: false } })).status).toBe(200);
    expect(writes()).toEqual([
      ["POST", `/rooms/${GROUP}/unit-accounts`, { unit: PART, by: READER }],
      ["POST", `/rooms/${GROUP}/accounts`, { accounts: [COLLEAGUE], by: READER }]
    ]);
    expect(callersSet()).toEqual([]);
  });

  test("an organisation whose people are all members already is not asked of the receiver", async () => {
    reset();
    members.add(String(POSTED));

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { units: [PART] } })).status).toBe(200);
    expect(writes()).toEqual([]);
  });

  test("one person refused refuses the whole, and an organisation of another company is refused", async () => {
    reset();

    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { accounts: [String(COLLEAGUE), String(OUTSIDER)] } })).status).toBe(403);
    expect((await asked(letInMany, { params: { chatId: String(GROUP) }, body: { units: [OTHER_COMPANY] } })).status).toBe(403);
    expect(writes()).toEqual([]);
  });
});
