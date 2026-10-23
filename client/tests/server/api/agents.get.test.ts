import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { AgentList } from "../../../apps/web/shared/types";

// The catalogue as the agency answers it, its agents and workers with each one's keepalive as the cache warmer
// holds it laid over its row, and the roles an agent may hold as the agents' answer carries them. An agency that does not answer leaves the list empty and says so. The gate order is
// the gate unit's, which is not split, so none stands beside the list; the receiver's default answerer does.

process.env.KEEPALIVE_CONSUMER = "agency";

let agencyAnswers = true;

standIn("AGENCY", (call) => {
  if (!agencyAnswers) return answer({ code: "service-unavailable", error: "the store is not open" }, 503);

  if (call.path.startsWith("/agents")) {
    return answer({
      items: [{ name: "agent-a", label: "Agent A", role: "builder", gates: null, reasoning: null, voice: null, resetAt: null, standInAvailable: false }],
      more: false,
      roles: [{ name: "builder", label: "Builder", bundles: [{ name: "graph.read", label: "Graph" }] }, { label: "no name" }]
    });
  }

  if (call.path.startsWith("/workers")) return answer({ items: [], more: false });

  return answer({ items: [{ name: "builder", tier: "builder", pooled: false }], more: false });
});
standIn("RECEIVER", (call) => {
  if (call.path.startsWith("/owner")) return answer({ room: 5, senderId: 1 });
  if (call.path.startsWith("/rooms/5/answerers")) return answer({ default: "agent-a", voice: "agent-a", items: [], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});
standIn("CACHE_WARMER", (call) =>
  call.path.startsWith("/consumers/agency/subjects")
    ? answer({ items: [{ id: 1, consumerName: "agency", name: "agent-a", on: false, pausedAt: 7_000, pausedUntil: 9_007_199_254_740_991, targetCount: 1 }], more: false })
    : answer({ items: [{ id: 1, consumerName: "agency", name: "chat-touch", subjectName: "agent-a", warmedAt: 5_500 }], more: false })
);

const handler = await routeOf<AgentList>("../../apps/web/server/api/agents.get");

describe("the agent list", () => {
  test("is the agency's, with the warmer's keepalive laid over each row", async () => {
    agencyAnswers = true;

    expect((await asked(handler, {})).answer).toMatchObject({
      reachable: true,
      agents: [{ name: "agent-a", kind: "chat", label: "Agent A", role: "builder", keepaliveStopped: true, keepalivePausedAt: 7, lastKeepaliveAt: 5 }],
      roles: [{ name: "builder", label: "Builder", bundles: [{ name: "graph.read", label: "Graph" }] }],
      gateOrder: null,
      defaultAnswerer: "agent-a"
    });
  });

  test("stands empty, and says so, while the agency does not answer", async () => {
    agencyAnswers = false;

    expect((await asked(handler, {})).answer).toEqual({ reachable: false, slow: false, agents: [], roles: [], gateOrder: null, defaultAnswerer: "agent-a" });
  });
});
