import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { DelegationPage } from "../../../apps/web/shared/types";

// The owner's own chat reads a delegated run from the agency alone (docs/web.md, the room screen's delegated-run
// marker): the waiting and running rows, then the latest ended one, as the agency lists them, each with the run its
// slot names.

const RUNNING = {
  token: "delegation-a", title: "Check the plan", askedBy: "agent-a", stage: "running", agentName: "doppelganger-a",
  role: "doppelganger", askedAt: 1, runningSince: 2, endedAt: null, outcome: null
};
const ENDED = {
  token: "delegation-b", title: "Retire it", askedBy: "agent-a", stage: "ended", agentName: "doppelganger-a",
  role: "doppelganger", askedAt: 3, runningSince: 4, endedAt: 5, outcome: "Done"
};

// The slot holding the running task, under the same token, and the run its turn writes under.
const SLOTS = {
  items: [{ role: "doppelganger", runs: [{ token: "delegation-a", role: "doppelganger", agent: "doppelganger-a", runName: "delegate-agent-a-2" }] }]
};

const agency = standIn("AGENCY", (call) =>
  call.path === "/delegations?ended=1"
    ? answer({ items: [RUNNING, ENDED] })
    : call.path === "/slots"
      ? answer(SLOTS)
      : answer({ code: "not-found", error: "no such route" }, 404)
);
const handler = await routeOf<DelegationPage>("../../apps/web/server/api/delegations.get");

test("carries the agency's delegations as it lists them, asking for the latest ended only", async () => {
  const { status, answer: page } = await asked(handler, {});

  expect(status).toBe(200);
  expect(page?.items.map((one) => one.token)).toEqual(["delegation-a", "delegation-b"]);
  expect(agency.asked.map((call) => call.path).sort()).toEqual(["/delegations?ended=1", "/slots"]);
});

test("names the run a delegation's slot holds by its token, and none for one the slots no longer hold", async () => {
  const { answer: page } = await asked(handler, {});

  expect(page?.items.map((one) => one.run)).toEqual([{ agent: "doppelganger-a", name: "delegate-agent-a-2" }, null]);
});
