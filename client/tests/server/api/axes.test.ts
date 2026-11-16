import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ProviderModelsView, ProviderView, RepositoryView, RoleAgentView, RolesView, SupervisorRoadStateView, SupervisorRoomView, SupervisorView, WorkNodeView } from "../../../apps/web/shared/axes";

// The agency's two axes and its places as the agent management screen asks them (the agency's docs/api.md,
// 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and 「providers, models and model files」):
// each answer read into the screen's shape, an untyped field read as the document states it, and a change carried
// only where its body reads as one.

const ENTRY = { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null };
const SUPERVISOR = {
  name: "agent-a", label: null, ownerAccount: null, aliases: null, icon: null, sessionScope: "agent", turnShape: "window",
  brainFolder: null, repository: "repo-a", ...ENTRY, warming: { "claude-code": true, deepseek: "yes" }, foldRatio: 0.8, gates: null, voice: null,
  sampling: null, seeded: false, resetPoint: null
};
const ROLE = {
  name: "worker", code: "worker", label: "Worker", prompt: null, description: null, bundles: [{ name: "web.read", code: "web-read", label: "Web reading" }],
  line: "worker", agents: [] as unknown[], maxConcurrent: 2, followsSupervisor: false, running: 2, waiting: 1,
  provider: "claude-code", waitingFor: null, providerPrompts: {} as Record<string, string>
};
// An agent of the role on a road, one switched off on the same road, and one that names no road.
const AGENT = {
  name: "worker-01", role: "worker", provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null, enabled: true,
  keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: true
};
const AGENT_OFF = { ...AGENT, name: "worker-02", enabled: false, carries: false };
const AGENT_FOLLOWING = { ...AGENT, name: "worker-03", provider: null, model: null, effort: null, followsSupervisor: true, carries: false };

ROLE.agents = [AGENT, AGENT_OFF, AGENT_FOLLOWING];
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

// The owner's account is user 5: the receiver names the owner's sender, and the account service links it to that user.
const OWNER_ACCOUNT = 5;
const OWNER_SENDER = 900;

standIn("RECEIVER", (call) => {
  if (call.path === "/owner") return answer({ room: -1, senderId: OWNER_SENDER });
  if (call.path === "/default-answerer") return answer({ supervisor: "" });

  return answer({ code: "not-found", error: "no such route" }, 404);
});
standIn("WEB_SERVER", (call) => {
  if (call.path === "/senders/users") return answer({ links: [{ sender: OWNER_SENDER, user: String(OWNER_ACCOUNT), signsIn: true }] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

// Supervisors filed under the owner's account, under another account, and under none while named as a person's BMO.
const FILED = [
  { ...SUPERVISOR, name: "agent-c", ownerAccount: OWNER_ACCOUNT },
  { ...SUPERVISOR, name: "agent-d", ownerAccount: 7 },
  { ...SUPERVISOR, name: "u7", ownerAccount: null }
];

const agency = standIn("AGENCY", (call) => {
  if (call.path === "/supervisors") return answer({ items: [SUPERVISOR, { ...SUPERVISOR, name: "agent-b", provider: null, model: null, effort: null }, ...FILED], more: false });
  if (call.path === "/supervisors/agent-a" && call.method === "PATCH") return answer({ ...SUPERVISOR, ...call.body });
  if (call.path === "/roles/worker" && call.method === "PATCH") return answer({ ...ROLE, ...call.body });
  if (call.path === "/roles" && call.method === "POST") return answer({ ...ROLE, ...call.body }, 201);
  if (call.path === "/roles") return answer({ roles: [ROLE, DOPPELGANGER, { ...OWN_ROLE, skills: ["skill-b"], providerPrompts: { codex: "text-a" } }], bundles: ROLE.bundles, skills: ["skill-a", "skill-b"], lines: ["worker"] });
  if (call.path === "/role-agents" && call.method === "POST") return answer({ ...AGENT, name: "worker-04", carries: false, ...call.body });
  if (call.path === "/role-agents/worker-01" && call.method === "PATCH") return answer({ ...AGENT, ...call.body });
  if (call.path === "/role-agents/worker-01" && call.method === "DELETE") return answer({ code: "conflict", error: "The agent carries a run." }, 409);
  if (call.path === "/role-agents/worker-02" && call.method === "DELETE") return answer({ name: "worker-02" });
  if (call.path === "/supervisors/agent-a" && call.method === "GET") return answer({ ...SUPERVISOR, provider: "deepseek", model: "deepseek-v4-pro" });
  if (call.path === "/supervisors/agent-a/rooms") return answer({ items: [{ roomId: 5, runs: 3, lastRunId: 41, lastRunUnit: "chat-agent-a-41", lastStartedAt: 1_700_000_000_000, lastFinishedAt: null }], more: false });
  if (call.path === "/supervisors/agent-a/road") return answer({ supervisor: "agent-a", ...ENTRY, answers: false, reason: "The provider's quota is spent." });
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
    const held = { enabled: true, coworker: true, lines: ["chat"], quota: null, reason: null, reasonCode: null, foldRatioDefault: 0.85, keyFile: null };

    return answer({
      items: [
        { ...held, name: "deepseek", code: "deepseek", label: "DeepSeek", registered: false, gateway: true, quota: { left: 0.5, window: "week", balance: null, resetsAt: null }, keyFile: "deepseek.key" },
        { ...held, name: "claude-code", code: "claude-code", label: "Claude Code", registered: false, gateway: false },
        { ...held, name: "registered", code: "registered", label: "Registered models", registered: true, gateway: true }
      ],
      more: false
    });
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
const agentAdd = await routeOf<RoleAgentView>("../../apps/web/server/api/role-agents.post");
const agentChange = await routeOf<RoleAgentView>("../../apps/web/server/api/role-agents/[name].patch");
const agentRemove = await routeOf<unknown>("../../apps/web/server/api/role-agents/[name].delete");
const repositories = await routeOf<RepositoryView[]>("../../apps/web/server/api/repositories.get");
const providerModels = await routeOf<ProviderModelsView>("../../apps/web/server/api/provider-models/[provider].get");
const providers = await routeOf<ProviderView[]>("../../apps/web/server/api/providers.get");
const supervisorRooms = await routeOf<SupervisorRoomView[]>("../../apps/web/server/api/supervisors/[name]/rooms.get");
const supervisorRoad = await routeOf<SupervisorRoadStateView>("../../apps/web/server/api/supervisors/[name]/road.get");
const workNodes = await routeOf<WorkNodeView[]>("../../apps/web/server/api/work-nodes.get");
const repositoryChange = await routeOf<RepositoryView>("../../apps/web/server/api/repositories/[name].patch");

describe("the supervisors", () => {
  test("stand by their name where they keep no label, on their one road, a warming that is no switch dropped", async () => {
    const got = await asked(supervisors, {});

    expect(got.status).toBe(200);
    expect(got.answer?.[0]).toEqual({
      name: "agent-a", label: "agent-a", ownerAccount: null, runsAsOwner: true, icon: null, aliases: null, sessionScope: "agent", turnShape: "window", defaultAnswerer: false,
      seeded: false, repository: "repo-a", road: ENTRY, warming: { "claude-code": true }, foldRatio: 0.8
    });
  });

  test("stand on no road where their row names none", async () => {
    expect((await asked(supervisors, {})).answer?.[1]).toMatchObject({ name: "agent-b", road: null });
  });

  // Every account's supervisors except the reader's own and the deployment's stay out of the list the route answers
  // (docs/web.md, 「Access」); the reader here is account 1, the owner's account another.
  test("are listed for the reader as their own and the deployment's alone", async () => {
    expect(((await asked(supervisors, {})).answer ?? []).map((one) => one.name)).toEqual(["agent-a", "agent-b"]);
  });

  // Read as the agency lists them all, the route's own list being the reader's (above).
  test("run as the owner's own user where the agency files them under no account or the owner's, a person's BMO's name aside", async () => {
    const { readSupervisors } = await import("../../../apps/web/server/utils/axes");
    const got = await readSupervisors();

    expect(got.slice(2).map((one) => ({ name: one.name, ownerAccount: one.ownerAccount, runsAsOwner: one.runsAsOwner }))).toEqual([
      { name: "agent-c", ownerAccount: OWNER_ACCOUNT, runsAsOwner: true },
      { name: "agent-d", ownerAccount: 7, runsAsOwner: false },
      { name: "u7", ownerAccount: 7, runsAsOwner: true }
    ]);
  });

  test("carry a road whole, so a changed provider keeps nothing of the one before it, and name no order, share or force", async () => {
    calls.length = 0;

    const road = { provider: "deepseek", model: "deepseek-v4-pro", effort: null, thinking: "off", answerTokens: 4096 };
    const got = await asked(supervisorChange, { params: { name: "agent-a" }, body: { road } });

    expect(got).toMatchObject({ status: 200, answer: { road } });
    expect(calls).toEqual([{ method: "PATCH", path: "/supervisors/agent-a", body: road }]);
  });

  test("carry a change the body names, and refuse a body naming none or a road of another shape", async () => {
    calls.length = 0;

    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: { foldRatio: 0.7, warming: { deepseek: true } } })).toMatchObject({ status: 200 });
    expect(calls).toMatchObject([{ method: "PATCH", path: "/supervisors/agent-a", body: { foldRatio: 0.7, warming: { deepseek: true } } }]);

    calls.length = 0;

    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: {} })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: { road: { provider: "deepseek" } } })).toMatchObject({ status: 400 });
    expect(await asked(supervisorChange, { params: { name: "agent-a" }, body: { order: [ENTRY], quotaShare: 0.5, active: null } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });
});

describe("the roles", () => {
  test("stand by their names, the agency's label kept beside them, with their bundles in the pack's words, their agents and their counts", async () => {
    const got = await asked(roles, {});

    expect(got.answer?.roles[0]).toMatchObject({ name: "worker", label: "Worker", running: 2, waiting: 1 });
    // Whether a run keeps its session and its threshold are its agent's, and no role's.
    for (const field of ["sessions", "foldRatio"]) expect(got.answer?.roles[0]).not.toHaveProperty(field);
    expect(got.answer?.roles[0]?.agents[0]).toMatchObject({ sessions: "keep", foldRatio: null });
    expect(got.answer?.roles[1]).toMatchObject({ name: "doppelganger", label: "Doppelganger" });
    expect(got.answer?.roles[2]).toMatchObject({ name: "role-own", label: "Own role" });
    expect(got.answer?.roles[0]).not.toHaveProperty("shown");
    expect(got.answer?.roles[0]?.agents.map((one) => [one.name, one.enabled, one.followsSupervisor, one.carries])).toEqual([
      ["worker-01", true, false, true],
      ["worker-02", false, false, false],
      ["worker-03", true, true, false]
    ]);
    // Its roads are those of its agents that are switched on and name one, each once.
    expect(got.answer?.roles[0]?.roads).toEqual([ENTRY]);
    expect(got.answer?.roles[0]?.maxConcurrent).toBe(2);
    expect(got.answer?.bundles[0]).toEqual({ name: "web.read", label: wording("agents.label.bundle_web_read") });
    expect(got.answer?.lines).toEqual(["worker"]);
  });

  test("carry a role's skills: the names it gives, none where it names none, every name the release carries, and null to clear them", async () => {
    const got = await asked(roles, {});

    expect(got.answer?.skills).toEqual(["skill-a", "skill-b"]);
    expect(got.answer?.roles.map((role) => role.skills)).toEqual([null, null, ["skill-b"]]);

    calls.length = 0;

    expect((await asked(roleChange, { params: { name: "worker" }, body: { skills: [" skill-a "] } })).status).toBe(200);
    expect((await asked(roleChange, { params: { name: "worker" }, body: { skills: null } })).status).toBe(200);
    expect(calls.map((call) => call.body)).toEqual([{ skills: ["skill-a"] }, { skills: null }]);

    for (const skills of ["skill-a", [3], [""]]) expect(await asked(roleChange, { params: { name: "worker" }, body: { skills } })).toMatchObject({ status: 400 });
  });

  test("carry a role's provider prompts: each read as the agency holds it, a changed one sent, an emptied one taken away", async () => {
    const got = await asked(roles, {});

    expect(got.answer?.roles.map((role) => role.providerPrompts)).toEqual([{}, {}, { codex: "text-a" }]);

    calls.length = 0;

    expect((await asked(roleChange, { params: { name: "worker" }, body: { providerPrompts: { "claude-code": "text-b", codex: "  " } } })).status).toBe(200);
    // A new role is sent only the texts written.
    expect((await asked(roleAdd, { body: { name: "role-b", label: "role-b", bundles: [], line: "worker", providerPrompts: { codex: "text-c", deepseek: null } } })).status).toBe(200);
    expect(calls.map((call) => call.body?.providerPrompts)).toEqual([{ "claude-code": "text-b", codex: null }, { codex: "text-c" }]);

    calls.length = 0;

    for (const providerPrompts of [["text"], null, { codex: 3 }]) {
      expect(await asked(roleChange, { params: { name: "worker" }, body: { providerPrompts } })).toMatchObject({ status: 400 });
    }
    expect(calls).toEqual([]);
  });

  test("refuse a change of another shape before it goes, and a new role missing what the agency requires", async () => {
    calls.length = 0;

    expect(await asked(roleChange, { params: { name: "worker" }, body: { line: 3 } })).toMatchObject({ status: 400 });
    expect(await asked(roleAdd, { body: { name: "role-b", label: "Role B", bundles: [] } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("carry no road and no setting of an agent's: an order, a cap, a forced provider, a sessions setting or a threshold sent for a role goes nowhere", async () => {
    calls.length = 0;

    expect(await asked(roleChange, { params: { name: "worker" }, body: { maxConcurrent: 1 } })).toMatchObject({ status: 400 });
    expect(await asked(roleChange, { params: { name: "worker" }, body: { order: [ENTRY], active: null } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);

    expect(await asked(roleChange, { params: { name: "worker" }, body: { sessions: "fresh", foldRatio: 0.5 } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);

    expect(await asked(roleChange, { params: { name: "worker" }, body: { line: "search", sessions: "fresh", order: [ENTRY], maxConcurrent: 1 } })).toMatchObject({ status: 200 });
    expect(calls).toMatchObject([{ method: "PATCH", path: "/roles/worker", body: { line: "search" } }]);
    expect(calls[0]?.body).not.toHaveProperty("sessions");
    expect(calls[0]?.body).not.toHaveProperty("order");
    expect(calls[0]?.body).not.toHaveProperty("maxConcurrent");
  });
});

describe("a role's agents", () => {
  test("are added to their role, on a road or on none", async () => {
    calls.length = 0;

    expect(await asked(agentAdd, { body: { role: "worker", provider: "deepseek", model: "deepseek-v4-pro", effort: null } })).toMatchObject({
      status: 200,
      answer: { name: "worker-04", role: "worker", provider: "deepseek", model: "deepseek-v4-pro", effort: null, followsSupervisor: false }
    });
    expect(await asked(agentAdd, { body: { role: "worker" } })).toMatchObject({ status: 200, answer: { name: "worker-04" } });
    expect(calls).toMatchObject([
      { method: "POST", path: "/role-agents", body: { role: "worker", provider: "deepseek", model: "deepseek-v4-pro", effort: null } },
      { method: "POST", path: "/role-agents", body: { role: "worker" } }
    ]);
  });

  test("are changed a field at a time, a cleared field sent as null", async () => {
    calls.length = 0;

    expect(await asked(agentChange, { params: { name: "worker-01" }, body: { enabled: false } })).toMatchObject({ status: 200, answer: { name: "worker-01", enabled: false } });
    // Its own settings: whether its runs keep their sessions and its threshold.
    expect(await asked(agentChange, { params: { name: "worker-01" }, body: { sessions: "fresh", foldRatio: 0.5 } })).toMatchObject({
      status: 200,
      answer: { sessions: "fresh", foldRatio: 0.5 }
    });
    expect(await asked(agentChange, { params: { name: "worker-01" }, body: { prompt: "  ", bundles: ["web.read"], skills: null, keepsCache: true } })).toMatchObject({
      status: 200,
      answer: { prompt: null, bundles: ["web.read"], skills: null, keepsCache: true }
    });
    expect(calls).toMatchObject([
      { method: "PATCH", path: "/role-agents/worker-01", body: { enabled: false } },
      { method: "PATCH", path: "/role-agents/worker-01", body: { sessions: "fresh", foldRatio: 0.5 } },
      { method: "PATCH", path: "/role-agents/worker-01", body: { prompt: null, bundles: ["web.read"], skills: null, keepsCache: true } }
    ]);
  });

  test("refuse a body of another shape before it goes", async () => {
    calls.length = 0;

    expect(await asked(agentAdd, { body: { provider: "deepseek" } })).toMatchObject({ status: 400 });
    expect(await asked(agentChange, { params: { name: "worker-01" }, body: {} })).toMatchObject({ status: 400 });
    expect(await asked(agentChange, { params: { name: "worker-01" }, body: { enabled: "yes" } })).toMatchObject({ status: 400 });
    expect(await asked(agentChange, { params: { name: "worker-01" }, body: { bundles: [3] } })).toMatchObject({ status: 400 });
    expect(await asked(agentChange, { params: { name: "worker-01" }, body: { sessions: "sometimes" } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  test("are removed, one that carries a run refused in the pack's words", async () => {
    expect(await asked(agentRemove, { params: { name: "worker-02" } })).toMatchObject({ status: 200 });
    expect(await asked(agentRemove, { params: { name: "worker-01" } })).toMatchObject({ status: 409, message: wording("agents.error.role_agent_refused") });
  });
});

describe("a role's sessions", () => {
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

describe("a supervisor's rooms and its road", () => {
  test("name each room with its latest run, the run a screen opens its log at", async () => {
    const got = await asked(supervisorRooms, { params: { name: "agent-a" } });

    expect(got.answer).toEqual([{ chatId: 5, runs: 3, lastRun: "chat-agent-a-41", lastStartedAt: 1_700_000_000_000, lastFinishedAt: null }]);
  });

  test("say whether its road can take a turn now, with the agency's sentence for why it cannot", async () => {
    calls.length = 0;

    const got = await asked(supervisorRoad, { params: { name: "agent-a" } });

    expect(got.answer).toEqual({ answers: false, reason: "The provider's quota is spent." });
    expect(calls).toMatchObject([{ method: "GET", path: "/supervisors/agent-a/road" }]);
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

    expect(got.answer?.[0]).toMatchObject({ name: "deepseek", label: wording("agents.label.provider_deepseek"), lines: ["chat"], quota: { left: 0.5, window: "week" }, reason: null, foldRatioDefault: 0.85, keyFile: "deepseek.key" });
  });

  test("hold the registry's provider and the one the gateway does not serve as the owner's own engines, and no other", async () => {
    const got = await asked(providers, {});

    expect(got.answer?.map((one) => [one.name, one.ownersEngine])).toEqual([["deepseek", false], ["claude-code", true], ["registered", true]]);
  });

  test("read a provider's models, a member that is no model left out", async () => {
    const got = await asked(providerModels, { params: { provider: "deepseek" } });

    expect(got.answer).toEqual({ provider: "deepseek", models: [{ id: "deepseek-v4-pro", efforts: ["low"], inService: true, thinking: true, answerTokens: 8192 }], staleReadAt: null });
  });
});
