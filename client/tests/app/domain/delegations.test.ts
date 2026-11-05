import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { delegationLine, delegationLines, roomDelegations } from "../../../apps/web/app/domain/delegations";

import type { DelegationView } from "../../../apps/web/shared/types";

// The line the owner's own chat stands for a task a supervisor delegated to its double (docs/web.md, the room
// screen's delegated-run marker): a waiting or running run says what it is at and what it was asked to do, and an
// ended run stands what it came to instead of a marker.

function delegation(over: Partial<DelegationView> = {}): DelegationView {
  return {
    token: "delegation-a",
    title: "Check the plan",
    askedBy: "agent-a",
    stage: "running",
    agentName: "doppelganger-a",
    role: "doppelganger",
    askedAt: 1_700_000_000_000,
    runningSince: 1_700_000_030_000,
    endedAt: null,
    outcome: null,
    ...over
  };
}

describe("which delegations a room stands", () => {
  test("only the runs its answerers asked for", () => {
    const items = [delegation(), delegation({ token: "delegation-b", askedBy: "agent-b" }), delegation({ token: "delegation-c", askedBy: null })];

    expect(roomDelegations(items, ["agent-a", "agent-c"]).map((one) => one.token)).toEqual(["delegation-a"]);
  });

  test("an empty name asks for nothing", () => {
    expect(roomDelegations([delegation()], ["", ""])).toEqual([]);
  });
});

describe("the marker a delegated run stands", () => {
  test("a running run says the role, that it works, and what it was asked to do", () => {
    expect(delegationLine(wording, delegation())).toEqual({
      key: "delegation-a",
      stage: "running",
      text: wording("room.status.delegation_running", { role: "doppelganger", title: "Check the plan" })
    });
  });

  test("a waiting run says it waits for a slot, in the same line", () => {
    expect(delegationLine(wording, delegation({ stage: "waiting" })).text).toBe(
      wording("room.status.delegation_waiting", { role: "doppelganger", title: "Check the plan" })
    );
  });

  test("a run with no title names the agent it was bound to, or the role alone", () => {
    expect(delegationLine(wording, delegation({ title: null })).text).toBe(
      wording("room.status.delegation_running", { role: "doppelganger", title: "doppelganger-a" })
    );
    expect(delegationLine(wording, delegation({ title: null, agentName: null })).text).toBe(
      wording("room.status.delegation_running_untitled", { role: "doppelganger" })
    );
  });

  test("an ended run stands what it came to, never the working marker", () => {
    const ended = delegationLine(wording, delegation({ stage: "ended", endedAt: 1_700_000_060_000, outcome: "Everything held" }));

    expect(ended.stage).toBe("ended");
    expect(ended.text).toBe(wording("room.status.delegation_ended_outcome", { role: "doppelganger", outcome: "Everything held" }));
  });

  test("an ended run with nothing said stands the role alone", () => {
    expect(delegationLine(wording, delegation({ stage: "ended" })).text).toBe(
      wording("room.status.delegation_ended", { role: "doppelganger" })
    );
  });
});

describe("the lines the room stands", () => {
  test("every waiting or running run stands one line, in the order the agency asked them", () => {
    const lines = delegationLines(wording, [
      delegation({ token: "delegation-a", stage: "waiting" }),
      delegation({ token: "delegation-b", title: "Second task" })
    ]);

    expect(lines.map((one) => one.key)).toEqual(["delegation-a", "delegation-b"]);
    expect(lines.map((one) => one.stage)).toEqual(["waiting", "running"]);
  });

  test("a run waiting or running produces the marker, and an ended one does not", () => {
    const running = delegationLines(wording, [delegation()]);
    const ended = delegationLines(wording, [delegation({ stage: "ended", outcome: "Done" })]);

    expect(running.some((one) => one.stage === "running" || one.stage === "waiting")).toBe(true);
    expect(ended.some((one) => one.stage === "running" || one.stage === "waiting")).toBe(false);
    // What it came to takes the marker's place rather than leaving nothing.
    expect(ended).toHaveLength(1);
    expect(ended[0]!.stage).toBe("ended");
  });

  test("an ended run's outcome stands only where nothing waits or runs", () => {
    const lines = delegationLines(wording, [
      delegation({ token: "delegation-a" }),
      delegation({ token: "delegation-b", stage: "ended", outcome: "Done" })
    ]);

    expect(lines.map((one) => one.key)).toEqual(["delegation-a"]);
  });

  test("nothing the agency no longer lists stands no line", () => {
    expect(delegationLines(wording, [])).toEqual([]);
  });
});
