import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// Whose agents a person reads (docs/web.md, 「Access」): an agent's log, its turns, its job lines and its own settings
// quote what was said in its rooms, a person's private room among them, so a reader other than the administrator reads
// the agents their own account owns alone — their own BMO and a role agent standing as theirs — and every other agent
// answers them as if it did not stand, nothing of it asked. The administrator reads every agent's.

const MEMBER = 7;

const agency = standIn("AGENCY", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/supervisors") {
    // The member's own BMO stands under no owner, as one given before the receiver passed the account on does, and
    // another under a name that only looks like a person's.
    return answer({ items: [{ name: `u${MEMBER}`, ownerAccount: null }, { name: "u5", ownerAccount: 5 }, { name: "agent-a", ownerAccount: null }, { name: `u0${MEMBER}`, ownerAccount: null }], more: false });
  }
  if (path === "/roles") return answer({ roles: [{ name: "worker", agents: [{ name: `worker-u${MEMBER}`, ownerAccount: String(MEMBER) }, { name: "worker-u5", ownerAccount: "5" }] }], bundles: [], lines: [] });
  // A run named `run-of-u5` is the other account's BMO's.
  if (path === "/runs") return answer({ items: [{ id: 9 }], more: false });
  if (path === "/log-lines") return answer({ items: [{ id: 1, runId: 9, jobId: null, agentName: "u5", kind: "text", text: "a private word", at: 1 }], more: false });

  return answer({ items: [], more: false });
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession"]);
globals.requireUserSession = async () => session;

const route = async (path: string) => await routeOf<unknown>(`../../apps/web/server/api/${path}`);

// Every read keyed by an agent's name, each with the request that reads it.
const READS: { name: string; handler: (event: RouteEvent) => Promise<unknown>; params: (agent: string) => Record<string, string> }[] = [
  { name: "log", handler: await route("agents/[name]/log.get"), params: (agent) => ({ name: agent }) },
  { name: "turns", handler: await route("agents/[name]/turns.get"), params: (agent) => ({ name: agent }) },
  { name: "job line", handler: await route("agents/[name]/job.get"), params: (agent) => ({ name: agent }) },
  { name: "job prompt", handler: await route("agents/[name]/job-prompt.get"), params: (agent) => ({ name: agent }) },
  { name: "supervisor", handler: await route("supervisors/[name].get"), params: (agent) => ({ name: agent }) },
  { name: "supervisor's road", handler: await route("supervisors/[name]/road.get"), params: (agent) => ({ name: agent }) },
  { name: "supervisor's rooms", handler: await route("supervisors/[name]/rooms.get"), params: (agent) => ({ name: agent }) },
  { name: "supervisor's settings", handler: await route("supervisors/[name]/settings.get"), params: (agent) => ({ name: agent }) },
  { name: "supervisor's draft", handler: await route("supervisors/[name]/draft.get"), params: (agent) => ({ name: agent }) }
];

// The calls a read made beyond asking whose agents are whose.
const reads = () => agency.asked.filter((one) => !["/supervisors", "/roles"].includes(one.path.split("?")[0] ?? ""));

const asMember = () => {
  session = { user: { name: "member", id: MEMBER }, sid: "bmo.sid=member", administrator: false };
};

describe("an agent's reads, for a member", () => {
  for (const read of READS) {
    test(`answer another account's BMO's ${read.name} as absent, asking nothing of it`, async () => {
      asMember();
      agency.asked.length = 0;

      for (const agent of ["u5", "agent-a", "worker-u5", `u0${MEMBER}`]) {
        expect((await asked(read.handler, { params: read.params(agent) })).status).toBe(404);
      }

      expect(reads()).toEqual([]);
    });
  }

  test("open their own BMO's log, an ownerless `u<user>` of theirs among them, and their own role agent's", async () => {
    asMember();

    const log = READS[0]!.handler;

    for (const agent of [`u${MEMBER}`, `worker-u${MEMBER}`]) {
      agency.asked.length = 0;

      expect((await asked(log, { params: { name: agent } })).status).toBe(200);
      expect(reads().map((one) => one.path.split("?")[0])).toEqual([`/log/agents/${agent}/lines`]);
    }
  });

  test("read no run of another agent through their own agent's log", async () => {
    asMember();

    const log = READS[0]!.handler;

    expect((await asked(log, { params: { name: `u${MEMBER}` }, query: { run: "run-of-u5" } })).answer).toEqual({ lines: [], hasMore: false, unavailable: true });
  });
});

describe("an agent's reads, for the administrator", () => {
  test("open every agent's log, and a run by its name", async () => {
    session = { user: { name: "boss" } };
    agency.asked.length = 0;

    expect((await asked(READS[0]!.handler, { params: { name: "u5" } })).status).toBe(200);
    expect((await asked(READS[0]!.handler, { params: { name: "u5" }, query: { run: "run-of-u5" } })).answer).not.toMatchObject({ unavailable: true });
  });
});

describe("a supervisor standing under no owner", () => {
  test("is the BMO of the account its name `u<user>` names, and of nobody where the name is anything else", async () => {
    const { supervisorOwner } = await import("../../../apps/web/server/utils/axes");

    expect(supervisorOwner({ name: "u7", ownerAccount: null })).toBe(7);
    expect(supervisorOwner({ name: "u7", ownerAccount: 9 })).toBe(9);

    for (const name of ["u07", "u7x", "u0", "u", "agent-a", "xu7"]) expect(supervisorOwner({ name, ownerAccount: null })).toBeNull();
  });
});

describe("an ownerless BMO's reads, for another account", () => {
  test("answer as absent", async () => {
    session = { user: { name: "member-8", id: 8 }, sid: "bmo.sid=member-8", administrator: false };
    agency.asked.length = 0;

    expect((await asked(READS[0]!.handler, { params: { name: `u${MEMBER}` } })).status).toBe(404);
    expect(reads()).toEqual([]);
  });
});
