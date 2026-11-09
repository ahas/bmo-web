import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { AgentList } from "../../../apps/web/shared/types";

// The agent list as the agency answers it: its supervisors with the rooms the receiver names for each, its roles with the runs
// their slots hold now, its repositories with their checkouts, and the line a job goes out on. An agency that does not
// answer leaves the list empty and says so. The gate order is the gate unit's, which is not split, so none stands
// beside the list; the supervisor the receiver's default answerer setting names does.

let agencyAnswers = true;

const ORDER = [{ provider: "codex", model: "model-a", effort: "high", thinking: null, answerTokens: null }];
// One agent of a role on that road.
const AGENTS = (role: string) => [{
  ...ORDER[0], name: `${role}-01`, role, enabled: true, position: 1, keepsCache: false, foldRatio: null, prompt: null, bundles: null, skills: null,
  followsSupervisor: false, carries: false
}];

standIn("AGENCY", (call) => {
  if (!agencyAnswers) return answer({ code: "service-unavailable", error: "the store is not open" }, 503);

  if (call.path === "/supervisors/agent-a/rooms") {
    return answer({ items: [{ roomId: 42, runs: 3, lastRunId: 9, lastRunUnit: "chat:42:1700000005500", lastStartedAt: 1_700_000_005_500, lastFinishedAt: null }], more: false });
  }

  if (call.path.startsWith("/supervisors")) {
    return answer({
      items: [
        {
          name: "agent-a", label: "Agent A", ownerAccount: null, aliases: null, icon: "i-material-symbols-mark-a", sessionScope: "agent",
          turnShape: "window", brainFolder: null, repository: null, order: ORDER, quotaShare: 0.01, warming: {},
          foldRatio: 0.8, gates: null, voice: null, sampling: null, provider: "codex", model: "model-a", effort: "high", waitingFor: null
        }
      ],
      more: false
    });
  }

  if (call.path.startsWith("/roles")) {
    return answer({
      roles: [
        {
          name: "worker", code: "worker", label: "Worker", prompt: null, description: null,
          bundles: [{ name: "graph.read", code: "graph-read", label: "Graph" }], line: "worker", agents: AGENTS("worker"),
          maxConcurrent: 3, sessions: "keep", foldRatio: 0.8, callable: false, running: 1, waiting: 0, provider: "codex", waitingFor: null
        },
        {
          name: "role-x", code: "role-x", label: "Role X", prompt: null, description: null, bundles: [], line: "search", agents: AGENTS("role-x"),
          maxConcurrent: 2, sessions: "keep", foldRatio: 0.8, callable: false, running: 0, waiting: 0, provider: null,
          waitingFor: "no quota"
        }
      ],
      bundles: [],
      lines: ["worker", "search"]
    });
  }

  if (call.path.startsWith("/repositories")) {
    return answer({
      items: [
        {
          name: "repo-a", label: "Repository A", icon: null, ownerAccount: null, path: "/srv/repo-a", nodeName: null, supportCount: 0,
          prefixDocuments: [], preamble: null, rules: null, devCommand: null, pin: null, downgradeHeal: true, sampling: null,
          checkouts: [{ name: "repo-a", path: "/srv/repo-a", nodeName: null, job: { jobId: 7, itemId: 42, role: "worker" } }, { name: "repo-a-1", path: "/srv/repo-a-1", nodeName: null, job: null }]
        }
      ],
      more: false
    });
  }

  if (call.path.startsWith("/slots")) {
    return answer({
      items: [
        { role: "worker", maxConcurrent: 3, active: 1, reserved: 0, waiting: 0, runs: [{ role: "worker", path: "/srv/repo-a", provider: "codex", model: "model-a", source: "job", since: 1_000 }] },
        { role: "role-x", maxConcurrent: 2, active: 0, reserved: 0, waiting: 0, runs: [] }
      ]
    });
  }

  if (call.path.startsWith("/jobs")) return answer({ items: [{ id: 7, roleName: "worker" }], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});
standIn("RECEIVER", (call) => {
  if (call.path === "/default-answerer") return answer({ supervisor: "agent-a" });
  // The default answerer answers the room its turns went into, and a room naming none it never spoke in; the room it
  // spoke in and that names another supervisor now is not its own.
  if (call.path === "/supervisors/agent-a/rooms") {
    return answer({ items: [{ id: 42, title: null, named: false, alone: true }, { id: -7, title: "Room", named: false, alone: true }], more: false });
  }
  if (call.path === "/rooms" || call.path.startsWith("/rooms?")) return answer({ items: [], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const handler = await routeOf<AgentList>("../../apps/web/server/api/agents.get");

describe("the agent list", () => {
  test("is the agency's supervisors, roles and repositories, each its own entry", async () => {
    agencyAnswers = true;

    const list = (await asked(handler, {})).answer as AgentList;

    expect(list.reachable).toBe(true);
    expect(list.agents.map((agent) => [agent.name, agent.kind])).toEqual([
      ["agent-a", "supervisor"],
      ["worker", "role"],
      ["role-x", "role"],
      ["repo-a", "repository"]
    ]);
    expect(list.agents[0]).toMatchObject({ label: "Agent A", defaultAnswerer: true, provider: "codex", model: "model-a", sessions: [{ chatId: 42, lastAt: 1_700_000_005 }, { chatId: -7, lastAt: null }] });
    expect(list.agents[1]).toMatchObject({ running: 1, model: "model-a", effort: "high", runs: [{ role: "worker", path: "/srv/repo-a", source: "job", since: 1_000 }] });
    expect(list.agents[2]).toMatchObject({ provider: null, waitingFor: "no quota", runs: [] });
    expect(list.agents[3]?.checkouts).toEqual([
      { name: "repo-a", path: "/srv/repo-a", node: null, jobId: 7, itemId: 42, role: "worker" },
      { name: "repo-a-1", path: "/srv/repo-a-1", node: null, jobId: null, itemId: null, role: null }
    ]);
    // A role is named by its name alone, never its label.
    expect(list.agents[1]?.label).toBe("worker");
    expect(list.agents[2]?.label).toBe("role-x");
    expect(list.roles).toEqual([
      { name: "worker", label: "worker", bundles: [{ name: "graph.read", label: wording("agents.label.bundle_graph_read") }] },
      { name: "role-x", label: "role-x", bundles: [] }
    ]);
    expect(list.jobLine).toBe("worker");
    expect(list.gateOrder).toBeNull();
    expect(list.defaultAnswerer).toBe("agent-a");
  });

  test("stands empty, and says so, while the agency does not answer", async () => {
    agencyAnswers = false;

    expect((await asked(handler, {})).answer).toEqual({ reachable: false, agents: [], roles: [], jobLine: null, gateOrder: null, defaultAnswerer: "agent-a" });
  });
});
