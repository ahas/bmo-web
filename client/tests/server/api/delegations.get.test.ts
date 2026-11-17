import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { DelegationPage } from "../../../apps/web/shared/types";

// The owner's own chat reads a delegated run from the agency alone (docs/web.md, the room screen's delegated-run
// marker): the waiting and running rows, then the latest ended one, as the agency lists them, each with the run the
// delegation names itself, else the one its slot names, and the agent its slot was let in on.

const ROAD = { provider: "claude-code", model: "model-a", session: null };
// Running, between being bound and its turn opening a run: only the slot names its run yet.
const RUNNING = {
  token: "delegation-a", title: "Check the plan", askedBy: "agent-a", stage: "running", role: "doppelganger", ...ROAD,
  askedAt: 1, runningSince: 2, endedAt: null, runName: null, runId: null, outcome: null
};
// Ended between two reads, never seen running: its slot is gone, and the agency keeps the run it named.
const ENDED = {
  token: "delegation-b", title: "Retire it", askedBy: "agent-a", stage: "ended", role: "doppelganger", ...ROAD,
  askedAt: 3, runningSince: 4, endedAt: 5, runName: "delegate-agent-a-1", runId: 41, outcome: "Done"
};
// Running under a run it names itself, while its slot still names the run of a turn before.
const NAMED = {
  token: "delegation-c", title: "Read the log", askedBy: "agent-a", stage: "running", role: "doppelganger", ...ROAD,
  askedAt: 6, runningSince: 7, endedAt: null, runName: "delegate-agent-a-3", runId: 43, outcome: null
};
const WAITING = {
  token: "delegation-d", title: null, askedBy: "agent-a", stage: "waiting", role: "doppelganger", ...ROAD,
  askedAt: 8, runningSince: null, endedAt: null, runName: null, runId: null, outcome: null
};

const SLOTS = {
  items: [{
    role: "doppelganger",
    runs: [
      { token: "delegation-a", role: "doppelganger", agent: "doppelganger-a", runName: "delegate-agent-a-2" },
      { token: "delegation-c", role: "doppelganger", agent: "doppelganger-b", runName: "delegate-agent-a-0" }
    ]
  }]
};

const agency = standIn("AGENCY", (call) =>
  call.path === "/delegations?ended=1"
    ? answer({ items: [RUNNING, NAMED, WAITING, ENDED] })
    : call.path === "/slots"
      ? answer(SLOTS)
      : answer({ code: "not-found", error: "no such route" }, 404)
);
const handler = await routeOf<DelegationPage>("../../apps/web/server/api/delegations.get");

test("carries the agency's delegations as it lists them, asking for the latest ended only", async () => {
  const { status, answer: page } = await asked(handler, {});

  expect(status).toBe(200);
  expect(page?.items.map((one) => one.token)).toEqual(["delegation-a", "delegation-c", "delegation-d", "delegation-b"]);
  expect(agency.asked.map((call) => call.path).sort()).toEqual(["/delegations?ended=1", "/slots"]);
});

test("names a delegation's run as the delegation names it, else as its slot does, so an ended one keeps its log", async () => {
  const { answer: page } = await asked(handler, {});

  expect(page?.items.map((one) => one.run)).toEqual([
    { agent: "doppelganger-a", name: "delegate-agent-a-2", id: null },
    { agent: "doppelganger-b", name: "delegate-agent-a-3", id: 43 },
    null,
    { agent: "doppelganger", name: "delegate-agent-a-1", id: 41 }
  ]);
});

test("names the agent a delegation runs on as its slot does, and none once it has left its slot", async () => {
  const { answer: page } = await asked(handler, {});

  expect(page?.items.map((one) => one.agentName)).toEqual(["doppelganger-a", "doppelganger-b", null, null]);
});
