import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SpaceView } from "../../../apps/web/shared/space";

// The agents' space as the live status screen reads it (docs/web.md, 「Live status screen」, the space): the machines
// from the node service, the repositories, the supervisors, the roles' agents and the runs let in on them from the
// agency, and the room a supervisor answers now from the receiver's live picture, read into one picture.

const SUPERVISOR = { name: "agent-a", label: "Agent A", provider: "claude-code", model: "model-s", effort: "high", order: [], quotaShare: 0.01, warming: {}, waitingFor: null };
const QUIET = { ...SUPERVISOR, name: "agent-b", label: null };
const AGENT = { name: "worker-01", role: "worker", provider: "deepseek", model: "model-w", effort: null, thinking: null, answerTokens: null, enabled: true, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: true };
const role = (name: string, waiting: number, agents: unknown[]) => ({ name, code: name, label: name, prompt: null, description: null, bundles: [], skills: null, line: "worker", agents, maxConcurrent: agents.length, followsSupervisor: false, running: 0, waiting, provider: null, waitingFor: null });
const ROLES = [
  role("worker", 2, [AGENT, { ...AGENT, name: "worker-02", carries: false }, { ...AGENT, name: "worker-03", enabled: false, provider: null, model: null }]),
  role("scout", 0, [{ ...AGENT, name: "scout-01", role: "scout" }])
];
const REPOSITORIES = [
  { name: "repo-a", label: "Repo A", icon: null, path: "/srv/repo-a", nodeName: "node-a", checkouts: [{ name: "repo-a-w2", path: "/srv/repo-a-w2", nodeName: "node-a", kind: "support", job: { jobId: 7, itemId: 12, role: "worker" } }] },
  { name: "repo-b", label: null, icon: null, path: "/srv/repo-b", nodeName: null, checkouts: [] }
];
const run = (extra: Record<string, unknown>) => ({ token: "t", role: "worker", path: null, provider: "deepseek", model: "model-w", source: "job", since: 5_000, agent: null, runName: null, session: null, jobId: null, title: null, ...extra });
const SLOTS = {
  items: [
    { role: "worker", maxConcurrent: 2, active: 2, reserved: 0, waiting: 2, runs: [run({ path: "/srv/repo-a-w2", agent: "worker-01", runName: "job-7", jobId: 7, title: "Fix it" }), run({ path: "/tmp/task-9", session: "session-9" })] },
    { role: "scout", maxConcurrent: 1, active: 0, reserved: 0, waiting: 0, runs: [] }
  ]
};

const down = { agency: false, node: false, receiver: false };

standIn("AGENCY", (call) => {
  const path = call.path.split("?")[0] ?? "";

  if (down.agency) return answer({ code: "failed", error: "down" }, 500);
  if (path === "/roles") return answer({ roles: ROLES, bundles: [], skills: [], lines: ["worker"] });
  if (path === "/supervisors") return answer({ items: [SUPERVISOR, QUIET], more: false });
  if (path === "/slots") return answer(SLOTS);
  if (path === "/repositories") return answer({ items: REPOSITORIES, more: false });

  return answer({ code: "not-found", error: "no route" }, 404);
});
standIn("NODE", () => (down.node ? answer({ code: "failed", error: "down" }, 500) : answer({ items: [{ name: "node-a", label: "Node A", kind: "work", thisMachine: true }, { name: "node-b", label: "Node B", kind: "card" }], more: false })));
standIn("RECEIVER", (call) => {
  if (down.receiver || (call.path.split("?")[0] ?? "") !== "/live") return answer({ code: "failed", error: "down" }, 500);

  return answer({ at: 9, compacting: [], queued: [], turns: [{ chatId: -7, since: 8, messages: [], instructions: [], speaker: { id: 1, name: "agent-a" } }, { chatId: -8, since: 9, speaker: { id: 1, name: "agent-a" } }, { chatId: -9, since: 9 }] });
});

const space = await routeOf<SpaceView>("../../apps/web/server/api/space.get");

describe("the agents' space", () => {
  test("names every machine and repository, a machine busy while a run works in a repository on it", async () => {
    const got = await asked(space, {});

    expect(got.status).toBe(200);
    expect(got.answer?.nodes).toEqual([{ name: "node-a", label: "Node A", busy: true }, { name: "node-b", label: "Node B", busy: false }]);
    expect(got.answer?.repositories).toEqual([{ name: "repo-a", label: "Repo A", node: "node-a" }, { name: "repo-b", label: "repo-b", node: null }]);
    expect(got.answer?.waiting).toEqual([{ role: "worker", count: 2 }]);
  });

  test("stands the supervisors first, one answering a room now with that room and since when", async () => {
    const agents = (await asked(space, {})).answer!.agents;

    expect(agents.map((agent) => agent.name)).toEqual(["agent-a", "agent-b", "worker-01", "worker-02", "worker-03", "scout-01"]);
    expect(agents[0]).toMatchObject({ label: "Agent A", role: null, enabled: true, work: { repository: null, chatId: -7, since: 8_000 } });
    expect(agents[0]!.road).toContain("model-s");
    expect(agents[1]).toMatchObject({ label: "agent-b", work: null });
  });

  test("puts each run on the agent it was let in on, and one that names none on a free agent of its role", async () => {
    const agents = (await asked(space, {})).answer!.agents;
    const of = (name: string) => agents.find((agent) => agent.name === name)!;

    expect(of("worker-01").work).toMatchObject({ repository: "repo-a", chatId: null, place: "Repo A", title: "Fix it", since: 5_000, model: "model-w", log: "job-7", stop: { kind: "item", id: "12" } });
    // A run in a folder no repository holds stands by the folder's last part, in no repository.
    expect(of("worker-02").work).toMatchObject({ repository: null, place: "task-9", session: "session-9", log: null, stop: null });
    expect(of("worker-03")).toMatchObject({ enabled: false, road: null, work: null });
    expect(of("scout-01")).toMatchObject({ role: "scout", work: null });
  });

  test("leaves a unit that does not answer out of the picture, and fails only where the agency does not", async () => {
    down.node = true;
    down.receiver = true;

    const partial = await asked(space, {});

    expect(partial.status).toBe(200);
    expect(partial.answer?.nodes).toEqual([]);
    expect(partial.answer?.agents[0]?.work).toBeNull();

    down.agency = true;
    expect((await asked(space, {})).status).toBeGreaterThanOrEqual(500);
    Object.assign(down, { agency: false, node: false, receiver: false });
  });
});
