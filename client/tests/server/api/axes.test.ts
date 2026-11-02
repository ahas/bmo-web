import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ProviderModelsView, ProviderView, RepositoryView, RolesView, SupervisorView } from "../../../apps/web/shared/axes";

// The agency's two axes and its places as the agent management screen asks them (the agency's docs/api.md,
// 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and 「providers, models and model files」):
// each answer read into the screen's shape, an untyped field read as the document states it, and a change carried
// only where its body reads as one.

const ENTRY = { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null };
const SUPERVISOR = {
  name: "agent-a", label: null, ownerAccount: null, aliases: null, icon: null, sessionScope: "agent", turnShape: "window", defaultAnswerer: true,
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
  checkouts: [{ name: "repo-a", path: "/srv/repo-a", nodeName: null, job: { jobId: 7, itemId: 12, role: "worker" } }, { name: "repo-a-w2", path: "/srv/repo-a-w2", nodeName: null, job: null }, { name: "broken" }]
};

const agency = standIn("AGENCY", (call) => {
  if (call.path === "/supervisors") return answer({ items: [SUPERVISOR], more: false });
  if (call.path === "/supervisors/agent-a" && call.method === "PATCH") return answer({ ...SUPERVISOR, ...call.body });
  if (call.path === "/roles") return answer({ roles: [ROLE], bundles: ROLE.bundles, lines: ["worker"] });
  if (call.path.startsWith("/roles/worker/sessions")) return answer({ items: [{ id: 2, sessionId: "s", path: "/srv/repo-a", provider: "claude-code", model: "m", effort: null, account: null, openedAt: 1, lastAnsweredAt: null, runs: 1, context: { tokens: 10, share: 0.5 }, valid: true }], more: false });
  if (call.path === "/repositories") return answer({ items: [REPOSITORY], more: false });
  if (call.path === "/provider-models/deepseek") return answer({ provider: "deepseek", models: [{ id: "deepseek-v4-pro", efforts: ["low"], inService: true }, { nothing: true }], staleReadAt: null });
  if (call.path === "/providers") {
    return answer({ items: [{ name: "deepseek", code: "deepseek", label: "DeepSeek", enabled: true, registered: false, coworker: true, lines: ["chat"], quota: { left: 0.5, window: "week", balance: null, resetsAt: null }, reason: null, reasonCode: null }], more: false });
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
  test("stand by the pack's word or the label the agency keeps, with their bundles in the pack's words, their order and their counts", async () => {
    const got = await asked(roles, {});

    expect(got.answer?.roles[0]).toMatchObject({ name: "worker", shown: wording("agents.label.role_worker"), running: 2, waiting: 1, sessions: "keep" });
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
      checkouts: [{ name: "repo-a", job: { jobId: 7, itemId: 12, role: "worker" } }, { name: "repo-a-w2", job: null }]
    });
    expect(got.answer?.[0]?.checkouts).toHaveLength(2);
  });
});

describe("the providers and the models they hold", () => {
  test("name a provider in the pack's words with what it has left", async () => {
    const got = await asked(providers, {});

    expect(got.answer?.[0]).toMatchObject({ name: "deepseek", label: wording("agents.label.provider_deepseek"), lines: ["chat"], quota: { left: 0.5, window: "week" }, reason: null });
  });

  test("read a provider's models, a member that is no model left out", async () => {
    const got = await asked(providerModels, { params: { provider: "deepseek" } });

    expect(got.answer).toEqual({ provider: "deepseek", models: [{ id: "deepseek-v4-pro", efforts: ["low"], inService: true }], staleReadAt: null });
  });
});
