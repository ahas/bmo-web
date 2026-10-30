import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { AgentRolesView, AgentRoleView, PoolLimitView } from "../../../apps/web/shared/agency";

// The role tab's routes and the co-worker table's limit: the agency's roles read into the table the tab shows, a role
// added, changed and removed through the agency's `/agent-roles`, and one place's limit set through its
// `PATCH /pool/limits` (docs/web.md, the role and model tabs).

const ROLES = [
  { name: "worker", label: "Worker", bundles: [{ name: "queue.read", label: "Queue read", code: "queue-read" }], maxConcurrent: null, prompt: null, tier: null, agents: 2, kindDefault: true },
  { name: "role-a", label: "Role A", bundles: [{ name: "bundle.a", label: "Bundle A" }], maxConcurrent: 3, prompt: "Be brief.", tier: "Fine", agents: 0, kindDefault: false }
];
const BUNDLES = [{ name: "queue.read", label: "Queue read", code: "queue-read" }, { name: "bundle.a", label: "Bundle A" }];

const agency = standIn("AGENCY", (call) => {
  if (call.method === "GET" && call.path === "/agent-roles") return answer({ roles: ROLES, bundles: BUNDLES });

  if (call.path === "/agent-roles" && call.method === "POST") {
    if (call.body?.name === "Bad Name") return answer({ code: "unprocessable-entity", error: "bad role name", field: "name" }, 422);

    return answer({ ...ROLES[1], ...call.body, bundles: [{ name: "bundle.a", label: "Bundle A" }], agents: 0, kindDefault: false }, 201);
  }

  if (call.path.startsWith("/agent-roles/") && call.method === "PATCH") return answer({ ...ROLES[1], ...call.body, bundles: ROLES[1]!.bundles });

  if (call.path.startsWith("/agent-roles/") && call.method === "DELETE") {
    return call.path === "/agent-roles/worker" ? answer({ code: "conflict", error: "role is held" }, 409) : new Response(null, { status: 204 });
  }

  if (call.path === "/pool/limits" && call.method === "PATCH") {
    if (call.body?.provider === "unknown") return answer({ code: "unprocessable-entity", error: "unknown provider" }, 422);

    return answer(call.body);
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});

const list = await routeOf<AgentRolesView>("../../apps/web/server/api/agent-roles.get");
const add = await routeOf<AgentRoleView>("../../apps/web/server/api/agent-roles.post");
const change = await routeOf<AgentRoleView>("../../apps/web/server/api/agent-roles/[name].patch");
const remove = await routeOf<{ ok: true }>("../../apps/web/server/api/agent-roles/[name].delete");
const limit = await routeOf<PoolLimitView>("../../apps/web/server/api/agency/pool/limits.patch");

describe("reading the roles", () => {
  test("stands every role in the agency's order, a role and a bundle named in the pack's words where it holds them", async () => {
    const read = await asked(list, {});

    expect(read.status).toBe(200);
    expect(read.answer?.roles.map((one) => one.name)).toEqual(["worker", "role-a"]);
    expect(read.answer?.roles[0]).toMatchObject({ shown: wording("agents.label.role_worker"), label: "Worker", agents: 2, kindDefault: true, maxConcurrent: null, tier: null });
    expect(read.answer?.roles[0]?.bundles).toEqual([{ name: "queue.read", label: wording("agents.label.bundle_queue_read") }]);
    expect(read.answer?.roles[1]).toMatchObject({ shown: "Role A", maxConcurrent: 3, prompt: "Be brief.", tier: "Fine" });
    expect(read.answer?.bundles).toEqual([{ name: "queue.read", label: wording("agents.label.bundle_queue_read") }, { name: "bundle.a", label: "Bundle A" }]);
  });
});

describe("adding, changing and removing a role", () => {
  test("adds a role with what it was given and none of what it was not", async () => {
    agency.asked.length = 0;

    const added = await asked(add, { body: { name: "role-b", label: "Role B", bundles: ["bundle.a"], maxConcurrent: null, prompt: "", tier: null } });

    expect(added.status).toBe(200);
    expect(added.answer?.name).toBe("role-b");
    expect(agency.asked).toMatchObject([{ method: "POST", path: "/agent-roles", body: { name: "role-b", label: "Role B", bundles: ["bundle.a"] } }]);
    expect(agency.asked[0]?.body).not.toHaveProperty("maxConcurrent");
    expect(agency.asked[0]?.body).not.toHaveProperty("prompt");
  });

  test("says a refused field in the pack's words, naming the field", async () => {
    const refused = await asked(add, { body: { name: "Bad Name", label: "Role", bundles: [] } });

    expect(refused.message).toBe(wording("agents.error.agency_unprocessable"));
    expect(refused.data).toMatchObject({ field: "name" });
  });

  test("changes only the fields the body names, a cleared bound and prompt sent as null", async () => {
    agency.asked.length = 0;

    const changed = await asked(change, { params: { name: "role-a" }, body: { maxConcurrent: null, prompt: "" } });

    expect(changed.status).toBe(200);
    expect(agency.asked).toEqual([{ method: "PATCH", path: "/agent-roles/role-a", body: { maxConcurrent: null, prompt: null } }]);
  });

  test("removes a role, and says a held one's refusal in the pack's words", async () => {
    expect(await asked(remove, { params: { name: "role-a" } })).toMatchObject({ status: 200, answer: { ok: true } });
    expect(await asked(remove, { params: { name: "worker" } })).toMatchObject({ status: 409, message: wording("agents.error.role_delete_refused") });
  });

  test("sends nothing for a body of another shape", async () => {
    agency.asked.length = 0;

    for (const body of [null, { label: "Role", bundles: [] }, { name: "role-c", bundles: [] }, { name: "role-c", label: "Role", bundles: "a" }, { name: "role-c", label: "Role", bundles: [], maxConcurrent: 0 }]) {
      expect(await asked(add, { body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    for (const body of [{}, { label: "" }, { maxConcurrent: 1.5 }, { tier: 3 }]) {
      expect(await asked(change, { params: { name: "role-a" }, body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(agency.asked).toEqual([]);
  });
});

describe("setting a co-worker limit", () => {
  test("puts that place's limit and answers what the agency holds", async () => {
    agency.asked.length = 0;

    const saved = await asked(limit, { body: { provider: "codex", tier: "Fine", capacity: 0 } });

    expect(saved.answer).toEqual({ provider: "codex", tier: "Fine", capacity: 0 });
    expect(agency.asked).toEqual([{ method: "PATCH", path: "/pool/limits", body: { provider: "codex", tier: "Fine", capacity: 0 } }]);
  });

  test("says the agency's refusal in the pack's words, and sends nothing for a body of another shape", async () => {
    expect(await asked(limit, { body: { provider: "unknown", tier: "Fine", capacity: 2 } })).toMatchObject({ message: wording("agents.error.agency_unprocessable") });

    agency.asked.length = 0;

    for (const body of [null, { tier: "Fine", capacity: 2 }, { provider: "codex", capacity: 2 }, { provider: "codex", tier: "Fine", capacity: -1 }, { provider: "codex", tier: "Fine", capacity: "2" }]) {
      expect(await asked(limit, { body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(agency.asked).toEqual([]);
  });
});
