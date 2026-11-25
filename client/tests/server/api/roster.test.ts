import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RosterAgent, RosterDetail, RosterPage, RosterRoom, RosterRun, RosterUnit } from "../../../apps/web/shared/roster";

// The organisation screen's people tab as the console serves it (docs/web.md, 「Organisation」, the people tab): the
// account service decides whom a reader looks through, and the console hands the reader on and the ask as the address
// names it; anyone it refuses, and a person outside the reader's reach, is answered as if nothing stood there. A
// person's rooms, agents, sessions and runs are the administrator's alone, and a head of the person's company is
// answered nothing of them. The paging, the search and who looks through whom are the account service's own tests.

const ADMIN = 1;
const HEAD = 3;
const MEMBER = 4;
const PERSON = 7;

const COMPANY = { id: 10, name: "company-a" };
const UNIT = { id: 11, name: "unit-a" };
const ROW = {
  user: String(PERSON), login: "person-a", name: "Person A", company: COMPANY, unit: UNIT, head: false, administrator: false, state: "active", jobTitle: "",
  machine: null, madeAt: 1, lastSignInAt: null
};

// Who looks through the person: the administrator and the head of their company.
const looksThrough = (key: string | undefined): boolean => key === String(ADMIN) || key === String(HEAD);

const accounts = standIn(
  "WEB_SERVER",
  (one) => {
    const path = one.path.split("?")[0] ?? "";
    const key = one.headers?.["owner-key"];
    const user = Number(/^\/users\/(\d+)$/.exec(path)?.[1]);

    if (Number.isSafeInteger(user)) return answer({ user: String(user), name: `account-${user}`, administrator: user === ADMIN, senders: [] });
    if (path === "/people/companies") return answer({ companies: looksThrough(key) ? [COMPANY] : [] });
    if (!looksThrough(key)) return answer({ code: "forbidden", error: "looks through no company" }, 403);
    if (path === "/people") return answer({ people: [ROW], total: 1, next: null });
    if (path === `/people/${PERSON}`) {
      return answer({ ...ROW, path: [COMPANY, UNIT], headOf: [], actingFor: [], posts: [], history: [], left: null, machineStanding: null, ...(key === String(ADMIN) ? { email: "person-a@example.com" } : {}) });
    }
    if (/^\/people\/\d+$/.test(path)) return answer({ code: "not-found", error: "no such person here" }, 404);

    return answer({ code: "failed", error: "Not served here." }, 500);
  },
  { headers: true }
);

standIn("AGENCY", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/supervisors") {
    return answer({ items: [{ name: `u${PERSON}`, label: "Their BMO", ownerAccount: PERSON, provider: "codex", model: "model-a" }, { name: "agent-a", label: null, ownerAccount: null }], more: false });
  }
  if (path === "/roles") return answer({ roles: [{ name: "worker", agents: [{ name: "worker-07", role: "worker", enabled: false, ownerAccount: String(PERSON), provider: null, model: null }] }], bundles: [], lines: [] });
  if (path === "/runs") {
    const agent = new URL(`http://unit${one.path}`).searchParams.get("agentName");

    return answer({ items: agent === "agent-a" ? [] : [{ id: agent === "worker-07" ? 2 : 1, name: "run", agentName: agent, state: "closed", startedAt: agent === "worker-07" ? 200 : 100, endedAt: 300, outcome: "done", roomId: null }], more: false });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/owner") return answer({ room: null, senderId: null });
  if (path === "/default-answerer") return answer({ supervisor: null });
  if (path === "/rooms") {
    return answer({
      items: [-21, -22].map((id) => ({ id, title: `room ${id}`, mode: id === -21 ? "talk" : null, listened: false, supervisors: [`u${PERSON}`], privateOf: id === -21 ? PERSON : null, sealed: false, ownerRoom: false, pinned: false, senders: [], messageCount: 3, lastMessageAt: id === -21 ? 1_000 : 2_000 })),
      more: false
    });
  }
  if (path === `/accounts/${PERSON}/rooms`) return answer({ rooms: [-21, -22] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

const signedIn = await import("../../../apps/web/server/utils/accounts");
const consoleRooms = await import("../../../apps/web/server/utils/console-rooms");
const roomPrivacy = await import("../../../apps/web/server/utils/room-privacy");

globalsRestoredAfter(["requireUserSession", "getUserSession", "signedInUser", ...Object.keys(consoleRooms), ...Object.keys(roomPrivacy)]);
Object.assign(globals, consoleRooms, roomPrivacy);
globals.requireUserSession = async () => session;
globals.getUserSession = async () => session;
globals.signedInUser = signedIn.signedInUser;

const as = (user: number) => ({ user: { name: `account-${user}`, id: user }, sid: `bmo.sid=${user}`, administrator: user === ADMIN });
const route = async <T>(path: string) => await routeOf<T>(`../../apps/web/server/api/organization/people/${path}`);
const person = { params: { user: String(PERSON) } };
const NOT_FOUND = { status: 404, message: wording("people.error.not_found") };

describe("the people tab's routes", () => {
  test("hand the reader on, and the ask as the address names it, leaving out what reads as nothing", async () => {
    session = as(HEAD);
    accounts.asked.length = 0;

    const page = await asked(await route<RosterPage>("index.get"), { query: { q: " person ", unit: "11", role: "boss", after: "cursor", limit: "x" } });

    expect(page).toMatchObject({ status: 200, answer: { people: [ROW], total: 1, next: null } });

    const call = accounts.asked.find((one) => one.path.startsWith("/people?"));

    expect(call?.headers?.["owner-key"]).toBe(String(HEAD));
    expect(Object.fromEntries(new URL(`http://unit${call?.path}`).searchParams)).toEqual({ q: "person", unit: "11", after: "cursor" });
  });

  test("answer a reader who looks through no company with no companies, and nothing found past that", async () => {
    session = as(MEMBER);

    expect((await asked(await route<RosterUnit[]>("companies.get"), {})).answer).toEqual([]);
    expect(await asked(await route<RosterPage>("index.get"), {})).toMatchObject(NOT_FOUND);
    expect(await asked(await route("[user].get"), person)).toMatchObject(NOT_FOUND);
  });

  test("give a head the person without the contact details, and nothing of what is theirs", async () => {
    session = as(HEAD);

    const read = await asked(await route<RosterDetail>("[user].get"), person);

    expect(read.status).toBe(200);
    expect(read.answer?.email).toBeUndefined();

    for (const group of ["rooms", "agents", "sessions", "runs"]) {
      expect({ group, ...(await asked(await route(`[user]/${group}.get`), person)) }).toMatchObject({ group, ...NOT_FOUND });
    }
  });

  test("give the administrator the person's rooms, agents and runs, and nothing of a person he does not look through", async () => {
    session = as(ADMIN);

    expect((await asked(await route("[user].get"), person)).answer).toMatchObject({ email: "person-a@example.com" });
    expect(((await asked(await route<RosterRoom[]>("[user]/rooms.get"), person)).answer ?? []).map((room) => [room.chatId, room.kind])).toEqual([[-22, "group"], [-21, "private"]]);
    expect(((await asked(await route<RosterAgent[]>("[user]/agents.get"), person)).answer ?? []).map((agent) => [agent.name, agent.kind, agent.enabled])).toEqual([[`u${PERSON}`, "supervisor", true], ["worker-07", "role", false]]);
    expect(((await asked(await route<RosterRun[]>("[user]/runs.get"), person)).answer ?? []).map((run) => [run.agent, run.startedAt])).toEqual([["worker-07", 200], [`u${PERSON}`, 100]]);
    expect(await asked(await route("[user]/rooms.get"), { params: { user: "99" } })).toMatchObject(NOT_FOUND);
  });
});
