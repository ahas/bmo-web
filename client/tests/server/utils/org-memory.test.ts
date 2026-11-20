import { describe, expect, test } from "bun:test";
import { createError } from "h3";

import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

import { fail } from "../../../apps/web/server/utils/fail";
import { acceptOrgMemory, editOrgMemory, orgMemoryView, writeOrgMemory } from "../../../apps/web/server/utils/org-memory";
import { wording } from "../../../apps/web/shared/wording";

import type { SignedIn } from "../../../apps/web/server/utils/accounts";

// A unit's org memory on the org memory tab (docs/web.md, 「Organisation」, the org memory tab): the console asks the
// account service whether the reader writes the unit's memory before it reads or writes, names the brain write's
// standing from that answer, shows which unit's memory stands for each topic as the brain answers it for the path, and
// leaves a memory a service keeps under its own key as that service wrote it. The account service and the brain are
// stood in for.

const globals = globalThis as Record<string, unknown>;

globalsRestoredAfter(["createError", "fail"]);
globals.createError = createError;
globals.fail = fail;

const COMPANY = 1;
const TEAM = 5;
const COMPANY_BRAIN = 10;
const TEAM_BRAIN = 20;

// The users the account service says write the team's memory.
const writers = new Set(["7"]);

standIn("WEB_SERVER", (call) => {
  if (call.method === "POST" && call.path === "/checks/org-memory") {
    return answer({ allowed: writers.has(String(call.body?.user)), grant: `bmo_org_memory:${call.body?.unit}#may_write`, user: call.body?.user });
  }
  if (call.method === "GET" && call.path === `/units/${TEAM}`) {
    const company = { id: COMPANY, name: "company-a" };

    return answer({ id: TEAM, name: "team-a", parent: COMPANY, company, path: [company, { id: TEAM, name: "team-a" }], children: [], heads: [], members: [], left: [], roles: [], concurrent: [] });
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});

function row(id: number, brainId: number, extra: Record<string, unknown>): Record<string, unknown> {
  return { id, brainId, key: null, type: "fact", text: `memory ${id}`, subjects: [], locked: false, internalOnly: true, actorName: "writer-a", validFrom: 1_000, createdAt: 1_000, ...extra };
}

const HOURS = { type: "topic", key: "working-hours" };
const memories: Record<string, unknown>[] = [
  row(101, COMPANY_BRAIN, { key: "attendance-working-hours", subjects: [HOURS], locked: true }),
  row(201, TEAM_BRAIN, { subjects: [HOURS] }),
  row(202, TEAM_BRAIN, { type: "rumor" })
];

const brain = standIn("ORG_BRAIN", (call) => {
  const url = new URL(call.path, "http://brain");

  if (call.method === "GET" && url.pathname === "/brains") {
    const id = { [String(COMPANY)]: COMPANY_BRAIN, [String(TEAM)]: TEAM_BRAIN }[url.searchParams.get("agentKey") ?? ""];

    return answer({ items: id === undefined ? [] : [{ id }], more: false });
  }
  if (call.method === "GET" && url.pathname === "/org-topics") return answer([{ topic: "working-hours", brainId: COMPANY_BRAIN, locked: true, memories: [] }]);

  const listed = /^\/brains\/(\d+)\/memories$/.exec(url.pathname);

  if (call.method === "GET" && listed !== null) {
    const proposals = url.searchParams.get("type") === "rumor";
    const items = memories.filter((one) => one.brainId === Number(listed[1]) && (one.type === "rumor") === proposals);

    return answer({ items, more: false });
  }

  const one = /^\/brains\/(\d+)\/memories\/(\d+)$/.exec(url.pathname);

  if (call.method === "GET" && one !== null) return answer(memories.find((each) => each.id === Number(one[2])));
  if (call.method === "POST") return answer({ id: 900 }, 201);

  return answer({ code: "not-found", error: "no route" }, 404);
});

const WRITER: SignedIn = { name: "writer-a", id: 7, administrator: false };
const MEMBER: SignedIn = { name: "member-b", id: 8, administrator: false };
const DRAFT = { text: "Weekly report by Friday", topic: null, locked: false, internalOnly: true };

describe("a unit's org memory", () => {
  test("shows the unit's own memories, its proposals and the path's, each with the unit standing for its topic", async () => {
    const view = await orgMemoryView(WRITER, TEAM);

    expect(view.own.map((one) => [one.id, one.standsInstead])).toEqual([[201, { id: COMPANY, name: "company-a", locked: true }]]);
    expect(view.proposals.map((one) => one.id)).toEqual([202]);
    expect(view.inherited.map((group) => [group.unit.id, group.memories.map((one) => [one.id, one.standsInstead, one.source])])).toEqual([
      [COMPANY, [[101, null, wording("org_memory.label.source_work_pattern")]]]
    ]);
    expect(view.topics).toEqual(["working-hours"]);
  });

  test("refuses a reader who writes the unit's memory not, asking the brain nothing", async () => {
    const before = brain.asked.length;

    await expect(orgMemoryView(MEMBER, TEAM)).rejects.toMatchObject({ statusCode: 403 });
    expect(brain.asked.length).toBe(before);
  });

  test("names a writer's standing as head, accepts a proposal as a fact, and leaves a service's memory as it wrote it", async () => {
    brain.asked.length = 0;

    await writeOrgMemory(WRITER, TEAM, DRAFT);
    await acceptOrgMemory(WRITER, TEAM, 202);
    await expect(editOrgMemory(WRITER, TEAM, 101, DRAFT)).rejects.toMatchObject({ statusCode: 409 });

    const posted = brain.asked.filter((call) => call.method === "POST").map((call) => [call.path, call.body]);

    expect(posted).toEqual([
      [`/brains/${TEAM_BRAIN}/memories`, { type: "fact", text: DRAFT.text, actorName: "writer-a", subjects: [], locked: false, internalOnly: true, standing: "head" }],
      [`/brains/${TEAM_BRAIN}/memories/202/versions`, { type: "fact", actorName: "writer-a", standing: "head" }]
    ]);
  });
});
