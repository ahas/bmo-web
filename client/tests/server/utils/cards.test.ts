import { expect, test } from "bun:test";

import { cardsStateOf } from "../../../apps/web/server/utils/cards";

import type { Cluster } from "../../../apps/web/server/utils/cards";

// The card master's picture as the monitor's services tab reads it (docs/web.md, 「Monitor's services tab」): the
// occupants' tiers with the nodes each stands on, and each service's placement, read and never written.

const cluster: Cluster = {
  master: { version: "v", startedAt: 1_000, rulesFile: "rules.yaml", readEveryMs: 2_000 },
  groups: [],
  nodes: [
    { name: "node-a", desktop: false, link: { state: "connected" }, occupants: ["service-a", "service-b"], cards: [] },
    { name: "node-b", desktop: false, link: { state: "connected" }, occupants: ["service-b"], cards: [] }
  ],
  events: [],
  tiers: [{ name: "service-a", tier: 0.5 }, { name: "service-b", tier: 2 }],
  services: [{ serviceName: "service-b", tier: 2, priority: 50, nodeNames: ["node-b"], cardMiB: 11_000, spread: "many", alone: true }, { serviceName: "service-c" }]
};

test("reads each occupant's tier with the nodes it stands on, and each service's placement", () => {
  const state = cardsStateOf(cluster);

  expect(state.tiers).toEqual([
    { occupant: "service-a", tier: 0.5, nodes: ["node-a"] },
    { occupant: "service-b", tier: 2, nodes: ["node-a", "node-b"] }
  ]);
  expect(state.services).toEqual([
    { service: "service-b", tier: 2, priority: 50, nodes: ["node-b"], cardMiB: 11_000, many: true, alone: true },
    { service: "service-c", tier: null, priority: null, nodes: [], cardMiB: null, many: false, alone: false }
  ]);
});
