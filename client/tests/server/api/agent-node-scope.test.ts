import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RepositoryView, RolesView, SupervisorView } from "../../../apps/web/shared/axes";

// The agency's lists read under a node of the organisation screen (docs/web.md, 「System and organisation」, the agent
// tabs; the agency's `docs/api.md`, 「Who a caller acts for」): where the address names a node, the route carries the
// owner parameters through to the agency, which answers what that reader reaches there, and the console's own
// whose-row rule stands aside; where it names none, or a value that reads as none, the read stays exactly as it was.
// A row added at a node is filed under it, written as the caller so the agency judges the filing.

const HEAD = "11";

standIn("RECEIVER", (call) => {
  if (call.path === "/default-answerer") return answer({ supervisor: "" });

  return answer({ code: "not-found", error: "no such route" }, 404);
});
standIn("WEB_SERVER", (call) => {
  if (call.path === "/senders/users") return answer({ links: [] });
  // Unit 6 stands under unit 5, as the console's own organisation answers it.
  if (call.path.startsWith("/units/5/subtree")) return answer({ units: [{ id: 5 }, { id: 6 }] });
  // The reader holds every part of agent management.
  if (/^\/users\/[^/]+\/sections/.test(call.path)) {
    return answer({ sections: ["supervisors", "roles", "repositories", "models", "model-files"].map((section) => ({ section, read: true, write: true })) });
  }

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const ROAD = { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null, advisor: null };
const SUPERVISOR = {
  name: "agent-a", label: null, ownerAccount: null, aliases: null, icon: null, sessionScope: "agent", turnShape: "window",
  brainFolder: null, repository: null, ...ROAD, warming: {}, foldRatio: null, gates: null, voice: null, sampling: null, seeded: false, resetPoint: null
};
// A supervisor of unit 5, which the console's own whose-row rule keeps out of an unscoped read.
const UNIT_SUPERVISOR = { ...SUPERVISOR, name: "unit-agent", ownerAccount: 9, ownerUnit: 5 };

const EMBEDDED = { name: "foreign-worker", role: "worker", provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null, enabled: true, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false, ownerAccount: 42, ownerUnit: 9 };
const REACHED = { ...EMBEDDED, name: "unit-worker", ownerAccount: null, ownerUnit: 5 };
const ROLE = {
  name: "worker", code: "worker", label: "Worker", prompt: null, description: null, bundles: [], line: "worker",
  agents: [EMBEDDED], maxConcurrent: 2, followsSupervisor: false, running: 0, waiting: 0, provider: null, waitingFor: null, providerPrompts: {}
};
const IDLE_ROLE = { ...ROLE, name: "idle", code: "idle", label: "Idle" };

const REPOSITORY = {
  name: "unit-repo", label: null, icon: null, ownerAccount: 9, ownerUnit: 5, path: "/work/unit-repo", nodeName: null, supportCount: "auto",
  umbrella: false, prefixDocuments: [], preamble: null, rules: null, devCommand: null, pin: null, downgradeHeal: true, checkouts: []
};

const MODEL = { key: "registered::model-a-0-1", provider: "registered", model: "RVN-model", tier: "large", healthy: true, lastAnsweredAt: null };

const agency = standIn(
  "AGENCY",
  (call) => {
    if (call.method === "GET" && call.path === "/supervisors?unit=5&unitSubtree=6") return answer({ items: [SUPERVISOR, UNIT_SUPERVISOR], more: false });
    if (call.method === "GET" && call.path === "/supervisors?ownerAccount=7") return answer({ items: [UNIT_SUPERVISOR], more: false });
    if (call.method === "GET" && call.path === "/supervisors") return answer({ items: [SUPERVISOR, UNIT_SUPERVISOR], more: false });
    if (call.method === "GET" && call.path === "/roles") return answer({ roles: [ROLE, IDLE_ROLE], bundles: [], skills: [], lines: ["worker"] });
    if (call.method === "GET" && call.path === "/role-agents?unit=5&unitSubtree=6") return answer({ items: [REACHED], more: false });
    if (call.method === "POST" && call.path === "/role-agents") return answer({ ...REACHED, ...(call.body ?? {}) }, 201);
    if (call.method === "GET" && call.path === "/repositories?unit=5&unitSubtree=6") return answer({ items: [REPOSITORY], more: false });
    if (call.method === "GET" && call.path === "/repositories") return answer({ items: [REPOSITORY], more: false });
    if (call.method === "GET" && call.path === "/models?unit=3") return answer({ items: [MODEL], more: false });
    if (call.method === "GET" && call.path === "/models") return answer({ items: [MODEL], more: false });
    if (call.method === "POST" && call.path === "/models") return answer({ ...MODEL, ...(call.body ?? {}) }, 201);

    return answer({ code: "not-found", error: "no such route" }, 404);
  },
  { headers: true }
);
const calls = agency.asked;

const api = "../../apps/web/server/api";
const supervisors = await routeOf<SupervisorView[]>(`${api}/supervisors.get`);
const roles = await routeOf<RolesView>(`${api}/roles.get`);
const repositories = await routeOf<RepositoryView[]>(`${api}/repositories.get`);
const models = await routeOf<unknown>(`${api}/models.get`);
const modelAdd = await routeOf<unknown>(`${api}/models.post`);
const agentAdd = await routeOf<unknown>(`${api}/role-agents.post`);

const UNIT = { unit: "5", unitSubtree: "true" };

// The calls as method, path and body: the stand-in keeps the headers for the owner check alone.
const shapes = (asked: readonly { method: string; path: string; body: Record<string, unknown> | null }[]) => asked.map(({ method, path, body }) => ({ method, path, body }));

describe("a scoped read of the agency's lists", () => {
  test("carries a unit and its subtree to the agency, and keeps every row it answers, the whose-row rule aside", async () => {
    calls.length = 0;

    const got = await asked(supervisors, { query: UNIT });

    expect(shapes(calls)).toEqual([{ method: "GET", path: "/supervisors?unit=5&unitSubtree=6", body: null }]);
    // The agency already judged the reach: unit 5's own head reads the row of account 9 that an unscoped read keeps out.
    expect((got.answer ?? []).map((one) => one.name)).toEqual(["agent-a", "unit-agent"]);
  });

  test("carries an account at a person's link to the agency the same way", async () => {
    calls.length = 0;

    expect((await asked(supervisors, { query: { ownerAccount: "7" } })).answer?.[0]?.name).toBe("unit-agent");
    expect(calls.some((call) => call.path === "/supervisors?ownerAccount=7")).toBe(true);
  });

  test("replaces the roles' agents with the node's own, and leaves a role none reached standing on none", async () => {
    calls.length = 0;

    const got = await asked(roles, { query: UNIT });

    expect(calls.map((call) => call.path).sort()).toEqual(["/role-agents?unit=5&unitSubtree=6", "/roles"]);
    expect((got.answer?.roles ?? []).map((one) => one.agents.map((agent) => agent.name))).toEqual([["unit-worker"], []]);
  });

  test("asks a unit's repositories of the agency and answers them whole", async () => {
    calls.length = 0;

    const got = await asked(repositories, { query: UNIT });

    expect(shapes(calls)).toEqual([{ method: "GET", path: "/repositories?unit=5&unitSubtree=6", body: null }]);
    expect(got.answer?.[0]).toMatchObject({ name: "unit-repo", path: "/work/unit-repo" });
  });

  test("asks a node's registered models of the agency", async () => {
    calls.length = 0;

    expect(await asked(models, { query: { unit: "3" } })).toMatchObject({ status: 200, answer: { items: [{ key: "registered::model-a-0-1", usedBy: [] }], more: false } });
    expect(shapes(calls)).toEqual([{ method: "GET", path: "/models?unit=3", body: null }]);
  });

  test("stands aside where the query names no owner, the console narrowing to its reader as it always did", async () => {
    calls.length = 0;

    // A value that does not read as a whole number names no owner: the read is unscoped and the row of account 9 stays out.
    expect((await asked(supervisors, { query: { unit: "soon" } })).answer?.map((one) => one.name)).toEqual(["agent-a"]);
    expect(shapes(calls)).toEqual([{ method: "GET", path: "/supervisors", body: null }]);
  });
});

describe("a row added at a node", () => {
  test("is filed under its unit and written as the caller, so the agency judges the filing", async () => {
    calls.length = 0;

    await agentAdd({ body: { role: "worker", ownerUnit: 5 }, context: { agencyOwner: { "owner-key": HEAD, "owner-role": "member" } } });

    const added = calls.find((call) => call.method === "POST")!;

    expect(added.body).toEqual({ role: "worker", ownerUnit: 5 });
    expect(added.headers?.["owner-key"]).toBe(HEAD);
  });

  test("keeps no filing at all where the node names no unit", async () => {
    calls.length = 0;

    await agentAdd({ body: { role: "worker" }, context: {} });

    expect(calls.find((call) => call.method === "POST")?.body).not.toHaveProperty("ownerUnit");
  });

  test("files a registered model under its unit by the field the agency reads", async () => {
    calls.length = 0;

    await modelAdd({ body: { key: "registered::model-a-0-1", model: "RVN-model", unit: 5 }, context: {} });

    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({ name: "registered::model-a-0-1", unit: 5 });
  });
});
