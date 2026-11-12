import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { CardsState } from "../../../apps/web/shared/cards";
import type { HistoryRange, LiveRange, MachineHardware, MonitorNode } from "../../../apps/web/shared/types";

// The monitor screen's reads (docs/web.md, 「Monitor screen」 and 「Monitor's services tab」): the node service's list,
// machines and readings, and the card master's picture, each put in the shape the screen draws — moments in
// seconds, a span's readings gathered into its points — and a switch written back to the node service.

const NOW = Date.now();
const band = (mean: number) => ({ min: mean - 1, max: mean + 1, mean });

const node = standIn("NODE", (one) => {
  const [path, query] = one.path.split("?") as [string, string | undefined];
  const params = new URLSearchParams(query ?? "");

  if (one.method === "DELETE" && path === "/nodes/node-b") {
    return params.get("leave") === "true"
      ? answer({ code: "conflict", error: "the hub refused the leave of node_b: no agent is attached" }, 409)
      : new Response(null, { status: 204 });
  }

  if (path === "/nodes" && !params.has("after")) {
    return answer({ items: [{ name: "node-a", label: "Node A", kind: "ssh", thisMachine: true, state: "connected" }], more: true });
  }

  if (path === "/nodes") return answer({ items: [{ name: "node-b", label: "Node B", kind: "hub", thisMachine: false, state: "disconnected" }], more: false });

  if (path === "/machines") {
    return answer({
      items: [
        { name: "local", label: "host-a", kind: "local", tracking: true, cpuLimit: 90, readAt: 1_790_000_000_500, hardware: null, failure: "the probe failed" },
        { name: "node-b", label: "Node B", kind: "hub", tracking: false, cpuLimit: null, readAt: 1_790_000_001_500, hardware: null, failure: null }
      ],
      more: false
    });
  }

  if (path === "/machines/missing") return answer({ code: "not-found", error: "No such machine." }, 404);

  if (path === "/machines/node-b" && one.method === "PATCH") {
    return answer({ name: "node-b", label: "Node B", kind: "hub", tracking: one.body?.tracking ?? true, cpuLimit: one.body?.cpuLimit ?? null, readAt: null });
  }

  if (path === "/machines/local") {
    return answer({ name: "local", label: "host-a", kind: "local", tracking: true, cpuLimit: 90, readAt: 1_790_000_000_500, hardware: null, failure: "the probe failed" });
  }

  if (path === "/machines/local/readings") {
    const spanMs = Number(params.get("spanMs"));
    const after = Number(params.get("after"));

    return answer({
      items: [
        { machineName: "local", at: after + 1 + spanMs, spanMs, cpu: { usePct: band(40), celsius: band(60) }, gpus: [{ index: 0, vramUsedGb: band(2) }] },
        { machineName: "local", at: after + 1 + 3 * spanMs, spanMs, cpu: { usePct: band(50) }, fans: [{ chip: "chip-a", label: "fan1", rpm: band(900) }] }
      ],
      more: false
    });
  }

  return answer({ code: "no-route", error: "Not served here." }, 404);
});

standIn("ARBITER", (one) => {
  // One picture as the stream publishes it, then the stream ends.
  if (one.path.startsWith("/events")) {
    const frame = { id: 1, kind: "cluster.changed", at: 1_790_000_005_000, data: picture() };

    return new Response(`: open\n\nevent: placement.created\ndata: {}\n\nid: 1\nevent: cluster.changed\ndata: ${JSON.stringify(frame)}\n\n`, {
      headers: { "content-type": "text/event-stream" }
    });
  }

  if (one.path !== "/cluster") return answer({ code: "no-route", error: "Not served here." }, 404);

  return answer(picture());
});

function picture(): Record<string, unknown> {
  return {
    master: { version: "1.0", startedAt: 1_790_000_000_000, rulesFile: "rules.toml", rulesLoadedAt: null, rulesError: null, readEveryMs: 2000 },
    groups: [{ name: "group-a", pool: true, nodeNames: ["node-a"], totalMiB: 100, freeMiB: 40 }],
    nodes: [{
      name: "node-a", role: null, desktop: false, link: { state: "connected", sinceAt: 1_790_000_001_000 }, version: "1.0", rules: null, occupants: [],
      cards: [{
        index: 0, name: "card-a", totalMiB: 100, usedMiB: 60, freeMiB: 40,
        units: [{ name: "service-a/part-a@node-a", serviceName: "service-a", part: "part-a", vramMiB: 60, state: "resident", ramMiB: 0, sinceAt: 1_790_000_002_000, evictable: true }],
        turn: { serviceName: "service-a", ticketId: "t-1", waitedMs: 1500 },
        queue: [{ ticketId: "t-2", serviceName: "service-b", waitedMs: 2500 }],
        claim: { claimantName: "occupant-a", claimedAt: 1_790_000_003_000 },
        ram: { dumpsMiB: 0 }, stage: { waiting: false, waitingMs: 0 }, processes: [{ pid: 1, name: "engine", serviceName: "service-a", usedMiB: 61 }]
      }]
    }],
    declared: [{ unit: "service-a/*", serviceName: "service-a", kind: "resident" }],
    services: [],
    placement: null,
    events: [{ at: 1_790_000_004_000, nodeName: "node-a", code: "unit-loaded", text: "A unit was loaded." }]
  };
}

const nodes = await routeOf<MonitorNode[]>("../../apps/web/server/api/nodes.get");
const machines = await routeOf<MachineHardware[]>("../../apps/web/server/api/hardware/machines.get");
const machine = await routeOf<MachineHardware>("../../apps/web/server/api/hardware/machines/[name].get");
const history = await routeOf<HistoryRange>("../../apps/web/server/api/hardware/machines/[name]/history.get");
const live = await routeOf<LiveRange>("../../apps/web/server/api/hardware/machines/[name]/live.get");
const tracking = await routeOf<{ machine: string; on: boolean }>("../../apps/web/server/api/hardware/tracking.post");
const cards = await routeOf<CardsState>("../../apps/web/server/api/cards/state.get");
const removal = await routeOf<null>("../../apps/web/server/api/nodes/[name].delete");
const cardEvents = await routeOf<Response>("../../apps/web/server/api/cards/events.get");

describe("the machines", () => {
  test("are the node list's, page after page, each by its name, label, kind, whether it is this machine and whether it is reached", async () => {
    expect(await nodes({})).toEqual([
      { name: "node-a", label: "Node A", kind: "ssh", thisMachine: true, connected: true },
      { name: "node-b", label: "Node B", kind: "hub", thisMachine: false, connected: false }
    ]);
  });

  test("every machine's recorded reading stands in one answer, its moments in seconds", async () => {
    expect(await machines({})).toEqual([
      { name: "local", label: "host-a", kind: "local", hardware: null, failure: "the probe failed", readAt: 1_790_000_000, tracking: true, cpuLimit: 90 },
      { name: "node-b", label: "Node B", kind: "hub", hardware: null, failure: null, readAt: 1_790_000_001, tracking: false, cpuLimit: null }
    ]);
    // The list is the recorder's own: the one route that reads no machine and so holds no tile.
    expect(node.asked.at(-1)).toMatchObject({ method: "GET", path: "/machines" });
  });

  test("a machine's reading stands with its moment in seconds, its limit and what was met", async () => {
    expect(await machine({ params: { name: "local" } })).toEqual({
      name: "local", label: "host-a", kind: "local", hardware: null, failure: "the probe failed", readAt: 1_790_000_000, tracking: true, cpuLimit: 90
    });
    expect(await asked(machine, { params: { name: "missing" } })).toMatchObject({ status: 404, message: wording("hardware.error.no_machine") });
  });

  test("a span's readings stand in the span's points, each figure by the series the charts draw", async () => {
    const range = await history({ params: { name: "local" }, query: { span: "1h" } });
    const asking = node.asked.at(-1)!.path;

    expect(asking).toContain("spanMs=60000");
    expect(range.pointSeconds).toBe(60);
    // An hour of minutes, its first point standing on the minute the hour began in.
    expect(range.at.length === 60 || range.at.length === 61).toBe(true);

    const first = range.series["cpu|use"]!.mean.findIndex((value) => value !== null);

    expect(range.series["cpu|use"]!.mean[first]).toBe(40);
    expect(range.series["cpu|use"]!.mean[first + 2]).toBe(50);
    expect(range.series["gpu0:vram|gb"]!.max[first]).toBe(3);
    expect(range.series["fan:chip-a:fan1|rpm"]!.min[first + 2]).toBe(899);
    expect(await asked(history, { params: { name: "local" }, query: { span: "2h" } })).toMatchObject({ status: 400, message: wording("hardware.error.bad_span") });
  });

  test("the live record stands as each reading's moment and its figures' means, only the ones asked for", async () => {
    const range = await live({ params: { name: "local" }, query: { since: String(Math.floor(NOW / 1000) - 30), metrics: "use" } });

    expect(node.asked.at(-1)!.path).toContain("spanMs=1000");
    expect(range.at).toHaveLength(2);
    expect(Object.keys(range.series)).toEqual(["cpu|use"]);
    expect(range.series["cpu|use"]).toEqual([40, 50]);
  });

  test("a tracking switch is written to the node service and answered as it now stands", async () => {
    expect(await tracking({ body: { machine: "node-b", on: false } })).toEqual({ machine: "node-b", on: false });
    expect(node.asked.at(-1)).toMatchObject({ method: "PATCH", path: "/machines/node-b", body: { tracking: false } });
    expect(await asked(tracking, { body: { machine: "node-b" } })).toMatchObject({ status: 400, message: wording("hardware.error.tracking_direction") });
  });
});

describe("a node's removal", () => {
  test("asks the node service to remove it, with a leave where one is asked, and says the hub's refusal", async () => {
    expect(await asked(removal, { params: { name: "node-b" } })).toMatchObject({ answer: null, message: "" });
    expect(node.asked.at(-1)).toMatchObject({ method: "DELETE", path: "/nodes/node-b" });

    const refused = await asked(removal, { params: { name: "node-b" }, query: { leave: "true" } });

    expect(node.asked.at(-1)).toMatchObject({ method: "DELETE", path: "/nodes/node-b?leave=true" });
    expect(refused.status).toBe(409);
    expect(refused.message).toBe(wording("hardware.error.node_leave_refused"));
  });
});

describe("the card master's picture", () => {
  test("stands in the board's shape, its moments in seconds and its waits in seconds", async () => {
    const state = await cards({});
    const card = state.nodes[0]!.cards[0]!;

    expect(state.master).toEqual({ version: "1.0", startedAt: 1_790_000_000, rulesFile: "rules.toml", rulesLoadedAt: null, rulesError: null, readEveryS: 2 });
    expect(state.groups).toEqual([{ name: "group-a", pool: true, nodes: ["node-a"], totalMiB: 100, freeMiB: 40 }]);
    expect(state.nodes[0]!.link).toEqual({ state: "connected", since: 1_790_000_001, readAt: null, lastReadMs: null, error: null });
    expect(card.units[0]).toMatchObject({ name: "service-a/part-a@node-a", service: "service-a", since: 1_790_000_002, kind: null, detail: null });
    expect(card.turn).toEqual({ service: "service-a", ticket: "t-1", waitedS: 1.5, inUse: null });
    expect(card.queue).toEqual([{ ticket: "t-2", service: "service-b", turn: false, position: null, waitedS: 2.5, waitS: null, unit: null, vramMiB: null }]);
    expect(card.claim).toEqual({ by: "occupant-a", since: 1_790_000_003 });
    expect(card.processes).toEqual([{ pid: 1, name: "engine", service: "service-a", usedMiB: 61 }]);
    expect(state.declared).toEqual([{ unit: "service-a/*", service: "service-a", kind: "resident", vramMiB: null }]);
    expect(state.events).toEqual([{ at: 1_790_000_004, node: "node-a", text: "A unit was loaded." }]);
  });

  test("is handed on from the master's stream as one state event a picture, in the same shape, and nothing else", async () => {
    const stream = await (await cardEvents({ node: {} } as never)).text();
    const frames = stream.split("\n\n").filter((frame) => frame !== "");

    expect(frames).toHaveLength(1);
    expect(frames[0]!.startsWith("event: state\ndata: ")).toBe(true);
    expect((JSON.parse(frames[0]!.slice("event: state\ndata: ".length)) as CardsState).master.startedAt).toBe(1_790_000_000);
  });
});
