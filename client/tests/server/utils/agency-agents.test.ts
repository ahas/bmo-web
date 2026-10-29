import { expect, test } from "bun:test";

import { agentSummaries } from "../../../apps/web/server/utils/agency";

// The agency's published shapes, as the reading takes them.
type Agent = Parameters<typeof agentSummaries>[0][number];
type Worker = Parameters<typeof agentSummaries>[1][number];

// The agent list as the console reads it from the agency's agents and workers (docs/boundary.md, 「Gaps the console
// meets」): every agent once, in its kind's group, a worker both answers name being one row.

const agent = (name: string, extra: Record<string, unknown> = {}): Agent => ({
  name, label: name.toUpperCase(), role: "role-a", gates: null, reasoning: null, voice: null, resetAt: null,
  standInAvailable: false, ownerAccount: null, ...extra
});

const worker = (name: string): Worker => ({
  name, label: `${name} label`, cwd: `/srv/checkouts/${name}`, icon: null, builtin: false, nodeName: "node-a",
  role: "worker", state: "resting", sampling: null, restingSince: null, sessionId: null, runCount: 3, lastRunAt: null,
  prefixDocuments: []
});

test("lists a worker both answers name once, its worker's fields on its agent's row", () => {
  const listed = agentSummaries(
    [agent("agent-a", { kind: "chat", defaultAnswerer: true }), agent("worker-a", { kind: "worker" }), agent("gate-a", { kind: "gate" })],
    [worker("worker-a"), worker("worker-b")]
  );

  expect(listed.map((one) => [one.name, one.kind])).toEqual([
    ["agent-a", "chat"],
    ["worker-a", "worker"],
    ["gate-a", "gate"],
    ["worker-b", "worker"]
  ]);
  expect(listed.find((one) => one.name === "worker-a")).toMatchObject({ cwd: "/srv/checkouts/worker-a", runs: 3 });
  expect(listed.find((one) => one.name === "agent-a")?.defaultAnswerer).toBe(true);
});

test("an agent whose row names no kind stands as a conversational one", () => {
  expect(agentSummaries([agent("agent-b")], [])[0]).toMatchObject({ kind: "chat", defaultAnswerer: false, chatId: null });
});

test("read what the agent's answer states beyond its published type: its shape, its model and its pin", () => {
  const listed = agentSummaries(
    [
      agent("agent-a", {
        kind: "chat",
        sessionScope: "agent",
        turnShape: "window",
        model: "deepseek-flash",
        configuredMode: "deepseek",
        configuredLabel: "DeepSeek",
        modelLabel: "DeepSeek Flash",
        lastMode: "registered",
        lastModel: "local-model",
        lastEffort: "high",
        pinnedProvider: "registered",
        pinnedModel: "local-model",
        aliases: "a",
        icon: "i-mark",
        cwd: "/srv/agent-a",
        builtin: true,
        runs: 7,
        lastRunAt: 1_700,
        lastKeepaliveAt: 1_600,
        contextTokens: 123,
        keepaliveStopped: true,
        keepalivePausedAt: 1_500
      })
    ],
    []
  );

  expect(listed[0]).toMatchObject({
    sessionScope: "agent",
    turnShape: "window",
    model: "deepseek-flash",
    configuredMode: "deepseek",
    configuredLabel: "DeepSeek",
    modelLabel: "DeepSeek Flash",
    lastMode: "registered",
    lastModel: "local-model",
    lastEffort: "high",
    pinnedProvider: "registered",
    pinnedModel: "local-model",
    aliases: "a",
    icon: "i-mark",
    cwd: "/srv/agent-a",
    builtin: true,
    runs: 7,
    lastRunAt: 1_700,
    lastKeepaliveAt: 1_600,
    contextTokens: 123,
    keepaliveStopped: true,
    keepalivePausedAt: 1_500
  });
});

test("a provider the bot does not carry, and a shape it does not know, read as none", () => {
  const listed = agentSummaries(
    [agent("agent-c", { kind: "chat", configuredMode: "nowhere", lastMode: "nowhere", pinnedProvider: "nowhere", turnShape: "other", sessionScope: "everywhere" })],
    []
  );

  expect(listed[0]).toMatchObject({ configuredMode: null, lastMode: null, pinnedProvider: null, turnShape: null, sessionScope: null });
});
