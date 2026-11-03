import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ProviderModelsView, ProviderView, RepositoryView, RolesView, StandInView, SupervisorRoomView, SupervisorView, WorkNodeView } from "../../../apps/web/shared/axes";

// The agency's two axes and its places as the agent management screen asks them (the agency's docs/api.md,
// 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and 「providers, models and model files」):
// each answer read into the screen's shape, an untyped field read as the document states it, and a change carried
// only where its body reads as one.

const ENTRY = { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null };
const SUPERVISOR = {
  name: "agent-a", label: null, ownerAccount: null, aliases: null, icon: null, sessionScope: "agent", turnShape: "window",
  brainFolder: null, repository: "repo-a", order: [ENTRY, { provider: "deepseek" }], quotaShare: 0.01, warming: { "claude-code": true, deepseek: "yes" },
  foldRatio: 0.8, gates: null, voice: null, sampling: null, provider: "claude-code", model: "claude-opus-5-5", effort: "high", waitingFor: null
};
const ROLE = {
  name: "worker", code: "worker", label: "Worker", prompt: null, description: null, bundles: [{ name: "web.read", code: "web-read", label: "Web reading" }],
  line: "worker", order: [ENTRY], quotaShare: 0.01, maxConcurrent: 3, sessions: "keep", foldRatio: 0.8, callable: false, running: 2, waiting: 1,
  provider: "claude-code", waitingFor: null
};
const REPOSITORY = {
  name: "repo-a", label: null, icon: null, ownerAccount: null, path: "/srv/repo-a", nodeName: null, supportCount: 1, prefixDocuments: ["docs/a.md"],
  preamble: null, rules: null, devCommand: null, pin: null, downgradeHeal: true, sampling: { temperature: 0.7, nonsense: "x" },
  samplingSettings: [{ name: "temperature", min: 0, max: 2 }, { name: "top_k", min: 0, max: null, whole: true }, { name: "preserve_thinking", switch: true }, { nothing: true }],
  checkouts: [
    { name: "repo-a", path: "/srv/repo-a", nodeName: null, kind: "base", job: { jobId: 7, itemId: 12, role: "worker" } },
    { name: "repo-a-w2", path: "/srv/repo-a-w2", nodeName: null, kind: "support", job: null },
    { name: "repo-a@node-a", path: "/srv/node-a/repo-a-node-a", nodeName: "node-a", kind: "node", job: null },
    { name: "broken" }
  ]
};
// A seeded role the pack words by its code, and one the owner added that it does not.
const DOPPELGANGER = { ...ROLE, name: "doppelganger", code: "doppelganger", label: "Doppelganger" };
const OWN_ROLE = { ...ROLE, name: "role-own", code: "role-own", label: "Own role" };

const agency = standIn("AGENCY", (call) => {
  if (call.path === "/supervisors") return answer({ items: [SUPERVISOR], more: false });
  if (call.path === "/supervisors/agent-a" && call.method === "PATCH") return answer({ ...SUPERVISOR, ...call.body });
  if (call.path === "/roles") return answer({ roles: [ROLE, DOPPELGANGER, OWN_ROLE], bundles: ROLE.bundles, lines: ["worker"] });
  if (call.path === "/supervisors/agent-a" && call.method === "GET") return answer({ ...SUPERVISOR, provider: "deepseek", model: "deepseek-v4-pro" });
  if (call.path === "/supervisors/agent-a/rooms") return answer({ items: [{ roomId: 5, runs: 3, lastRunId: 41, lastRunUnit: "chat-agent-a-41", lastStartedAt: 1_700_000_000_000, lastFinishedAt: null }], more: false });
  if (call.path.startsWith("/stand-in")) return answer({ answers: true, provider: "deepseek", model: "deepseek-v4-pro" });
  if (call.path === "/nodes") {
    return answer({
      items: [
        { name: "node-a", label: "Node A", kind: "ssh", role: null, state: "connected", checkedAt: null, takesJobs: true, jobsRefusal: null },
        { name: "node-b", label: "Node B", kind: "jake", role: null, state: "connected", checkedAt: null, takesJobs: false, jobsRefusal: "No SSH route." }
      ],
      more: false
    });
  }
  if (call.path === "/repositories/repo-a" && call.method === "PATCH") return answer({ ...REPOSITORY, ...call.body });
  if (call.path.startsWith("/roles/worker/sessions")) return answer({ items: [{ id: 2, sessionId: "s", path: "/srv/repo-a", provider: "claude-code", model: "m", effort: null, account: null, openedAt: 1, lastAnsweredAt: null, runs: 1, context: { tokens: 10, share: 0.5 }, valid: true }], more: false });
  if (call.path === "/repositories") return answer({ items: [REPOSITORY], more: false });
  if (call.path === "/provider-models/deepseek") {
    return answer({ provider: "deepseek", models: [{ id: "deepseek-v4-pro", efforts: ["low"], inService: true, thinking: true, answerTokens: 8192, contextTokens: 65536 }, { nothing: true }], staleReadAt: null });
  }
  if (call.path === "/providers") {
    return answer({ items: [{ name: "deepseek", code: "deepseek", label: "DeepSeek", enabled: true, registered: false, coworker: true, lines: ["chat"], quota: { left: 0.5, window: "week", balance: null, resetsAt: null }, reason: null, reasonCode: null, foldRatioDefault: 0.85 }], more: false });
  }

  return answer({ code: "not-found", error: "no such route" }, 404);
});
const calls = agency.asked;

const supervisors = await routeOf<SupervisorView[]>("../../apps/web/server/api/supervisors.get");
const supervisorChange = await routeOf<SupervisorView>("../../apps/web/server/api/supervisors/[name].patch");
const roles = await routeOf<RolesView>("../../apps/web/server/api/roles.get");
const roleChange = await routeOf<unknown>("../../apps/web/server/api/roles/[name].patch");
const roleAdd = await routeOf<unknown>("../../apps/web/server/api/roles.post");
const roleSessions = await routeOf<unknown>("../../apps/web/server/api/roles/[name]/sessions.get");
const repositories = await routeOf<RepositoryView[]>("../../apps/web/server/api/repositories.get");
const providerModels = await routeOf<ProviderModelsView>("../../apps/web/server/api/provider-models/[provider].get");
const providers = await routeOf<ProviderView[]>("../../apps/web/server/api/providers.get");
const supervisorRooms = await routeOf<SupervisorRoomView[]>("../../apps/web/server/api/supervisors/[name]/rooms.get");
const supervisorStandIn = await routeOf<{ standIn: StandInView | null }>("../../apps/web/server/api/supervisors/[name]/stand-in.get");
const workNodes = await routeOf<WorkNodeView[]>("../../apps/web/server/api/work-nodes.get");
const repositoryChange = await routeOf<RepositoryView>("../../apps/web/server/api/repositories/[name].patch");

describe("the supervisors", () => {
  test("stand by their name where they keep no label, an order's member that is no entry left out and a warming that is no switch dropped", async () => {
    const got = await asked(supervisors, {});

    expect(got.status).toBe(200);
    expect(got.answer?.[0]).toMatchObject({ name: "agent-a", label: "agent-a", order: [ENTRY], warming: { "claude-code": true }, foldRatio: 0.8 });
  });

  test("carry a change the body names, and refuse a body naming none or an order of another shape", async () => {
    calls.length = 0;

    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: { foldRatio: 0.7, warming: { deepseek: true } } })).toMatchObject({ status: 200 });
    expect(calls).toMatchObject([{ method: "PATCH", path: "/supervisors/agent-a", body: { foldRatio: 0.7, warming: { deepseek: true } } }]);
    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: {} })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: { order: [{ provider: "x" }] } })).toMatchObject({ status: 400 });
  });
});

describe("the roles", () => {
  test("stand by their names, the agency's label kept beside them, with their bundles in the pack's words, their order and their counts", async () => {
    const got = await asked(roles, {});

    expect(got.answer?.roles[0]).toMatchObject({ name: "worker", label: "Worker", running: 2, waiting: 1, sessions: "keep" });
    expect(got.answer?.roles[1]).toMatchObject({ name: "doppelganger", label: "Doppelganger" });
    expect(got.answer?.roles[2]).toMatchObject({ name: "role-own", label: "Own role" });
    expect(got.answer?.roles[0]).not.toHaveProperty("shown");
    expect(got.answer?.bundles[0]).toEqual({ name: "web.read", label: wording("agents.label.bundle_web_read") });
    expect(got.answer?.lines).toEqual(["worker"]);
  });

  test("refuse a change of another shape before it goes, and a new role missing what the agency requires", async () => {
    calls.length = 0;

    expect(await asked(roleChange, { params: { name: "worker" }, body: { sessions: "sometimes" } })).toMatchObject({ status: 400 });
    expect(await asked(roleChange, { params: { name: "worker" }, body: { maxConcurrent: -1 } })).toMatchObject({ status: 400 });
    expect(await asked(roleAdd, { body: { name: "role-b", label: "Role B", bundles: [], line: "worker", order: [ENTRY] } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("read a role's session history with its context as tokens and a share", async () => {
    const got = await asked(roleSessions, { params: { name: "worker" }, query: { before: "9" } });

    expect(got.answer).toMatchObject({ items: [{ id: 2, contextTokens: 10, contextShare: 0.5, valid: true }], more: false });
  });
});

describe("the repositories", () => {
  test("stand with each checkout and the job holding it, a checkout with no path left out and a sampling value of no shape dropped", async () => {
    const got = await asked(repositories, {});

    expect(got.answer?.[0]).toMatchObject({
      name: "repo-a",
      label: "repo-a",
      ownLabel: null,
      sampling: { temperature: 0.7 },
      samplingSettings: [{ name: "temperature", min: 0, max: 2 }, { name: "top_k", min: 0, max: null, whole: true }, { name: "preserve_thinking", switch: true }],
      checkouts: [
        { name: "repo-a", kind: "base", job: { jobId: 7, itemId: 12, role: "worker" } },
        { name: "repo-a-w2", kind: "support", job: null },
        { name: "repo-a@node-a", nodeName: "node-a", kind: "node", job: null }
      ]
    });
    expect(got.answer?.[0]?.checkouts).toHaveLength(3);
  });

  test("carry the node checkouts whole and a sampling setting given back to the engine, and refuse either of another shape", async () => {
    calls.length = 0;

    const body = { nodeCheckouts: [{ nodeName: "node-a", path: null }, { nodeName: "node-c", path: "~/repo-a" }], sampling: { temperature: null, top_k: 40 } };

    expect(await asked(repositoryChange, { params: { name: "repo-a" }, body })).toMatchObject({ status: 200 });
    expect(calls).toMatchObject([{ method: "PATCH", path: "/repositories/repo-a", body }]);
    expect(await asked(repositoryChange, { params: { name: "repo-a" }, body: { nodeCheckouts: [{ path: "/x" }] } })).toMatchObject({ status: 400 });
    expect(await asked(repositoryChange, { params: { name: "repo-a" }, body: { sampling: { temperature: "warm" } } })).toMatchObject({ status: 400 });
  });
});

describe("a supervisor's rooms and its stand-in", () => {
  test("name each room with its latest run, the run a screen opens its log at", async () => {
    const got = await asked(supervisorRooms, { params: { name: "agent-a" } });

    expect(got.answer).toEqual([{ chatId: 5, runs: 3, lastRun: "chat-agent-a-41", lastStartedAt: 1_700_000_000_000, lastFinishedAt: null }]);
  });

  test("name the stand-in its last turn went out on, below the first provider of its order", async () => {
    const got = await asked(supervisorStandIn, { params: { name: "agent-a" } });

    expect(got.answer).toEqual({ standIn: { provider: wording("agents.label.provider_deepseek"), model: "deepseek-v4-pro" } });
  });
});

describe("the work nodes", () => {
  test("are the agency's nodes that take jobs, each by its label and how it is reached", async () => {
    const got = await asked(workNodes, {});

    expect(got.answer).toEqual([{ name: "node-a", label: "Node A", kind: wording("hardware.label.kind_ssh") }]);
  });
});

describe("the providers and the models they hold", () => {
  test("name a provider in the pack's words with what it has left", async () => {
    const got = await asked(providers, {});

    expect(got.answer?.[0]).toMatchObject({ name: "deepseek", label: wording("agents.label.provider_deepseek"), lines: ["chat"], quota: { left: 0.5, window: "week" }, reason: null, foldRatioDefault: 0.85 });
  });

  test("read a provider's models, a member that is no model left out", async () => {
    const got = await asked(providerModels, { params: { provider: "deepseek" } });

    expect(got.answer).toEqual({ provider: "deepseek", models: [{ id: "deepseek-v4-pro", efforts: ["low"], inService: true, thinking: true, answerTokens: 8192 }], staleReadAt: null });
  });
});
