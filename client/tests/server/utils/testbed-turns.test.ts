import { describe, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import "../../support/nitro";
import { scratchDir } from "../../support/scratch";
import { answer, standIn } from "../../support/units";

import type { HeldCheckout, TestbedLane, TestbedLaneEntry } from "../../../apps/web/server/utils/testbed-turns";

// The testbed line on a running TODO row (docs/web.md, the TODO panel's section): the testbed's queue as its status
// verb prints it, each holder and waiter tied to a row through the checkout it runs in and the job the agency says
// holds that checkout. What is pinned here is which command lands on which row, and that another job's or nobody's
// never does.

const scratch = scratchDir("bmo-web-testbed-");

function entry(checkout: string, command: string, pid: number): TestbedLaneEntry {
  return { checkout, command, pid };
}

function lane(holders: TestbedLaneEntry[], waiting: TestbedLaneEntry[] = [], name = "wide"): TestbedLane {
  return { name, holders, waiting };
}

function checkout(path: string, itemId: number | null, jobId: number | null, nodeName: string | null = null): HeldCheckout {
  return { path, nodeName, job: itemId === null && jobId === null ? null : { itemId, jobId } };
}

// The status `bmo-testbed status --json` prints, as its boundary states it.
const STATUS = {
  queues: {
    items: [
      {
        name: "wide",
        width: 4,
        holders: [{ scope: null, checkout: "/work/repo-a", command: "cargo test", pid: 11, askedAt: 1, heldAt: 2, kept: false, front: false, next: false }],
        holder: null,
        waiting: [
          { scope: null, checkout: "/work/repo-c", command: "check", pid: 12, askedAt: 3, heldAt: null, kept: false, front: false, next: false },
          { scope: null, checkout: "/work/repo-b", command: "suite", pid: 13, askedAt: 4, heldAt: null, kept: false, front: false, next: false }
        ]
      },
      { name: "narrow", width: 1, holders: [], holder: null, waiting: [] }
    ],
    more: false
  },
  closeLine: null
};

standIn("AGENCY", (asked) => {
  const url = new URL(asked.path, "http://agency");

  if (url.pathname === "/repositories") {
    return answer({
      items: [{
        name: "repo",
        checkouts: [
          { name: "repo-a", path: "/work/repo-a", nodeName: null, kind: "base", job: { jobId: 101, itemId: 1, role: "coder" } },
          { name: "repo-b", path: "/work/repo-b", nodeName: null, kind: "support", job: { jobId: 102, itemId: 2, role: "coder" } },
          { name: "repo-c", path: "/work/repo-c", nodeName: null, kind: "support", job: null }
        ]
      }],
      more: false
    });
  }

  if (url.pathname === "/jobs") {
    return answer({
      items: [
        { id: 101, itemId: 1, state: "running", heldFor: null, agentName: "agent-a" },
        { id: 102, itemId: 2, state: "running", heldFor: null, agentName: "agent-b" }
      ],
      more: false
    });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const { itemTestbedTurns, lanesOf, readItemTestbedTurns, testbedProgram } = await import("../../../apps/web/server/utils/testbed-turns");

describe("what a running row says of the testbed's queue", () => {
  const running = new Map([[1, 101], [2, 102]]);

  test("a command holding a seat in a running job's checkout stands on its row with no place", () => {
    expect(itemTestbedTurns([lane([entry("/work/repo-a", "cargo test", 11)])], [checkout("/work/repo-a", 1, 101)], running)).toEqual([
      { itemId: 1, command: "cargo test", place: null }
    ]);
  });

  test("a waiting command stands with its place counted from one in its own lane's line", () => {
    const lanes = [lane([], [entry("/work/other", "check", 20), entry("/work/repo-b", "suite", 21)]), lane([], [entry("/work/repo-a", "bun run build", 22)], "narrow")];

    expect(itemTestbedTurns(lanes, [checkout("/work/repo-a", 1, 101), checkout("/work/repo-b", 2, 102)], running)).toEqual([
      { itemId: 1, command: "bun run build", place: 1 },
      { itemId: 2, command: "suite", place: 2 }
    ]);
  });

  test("a folder under the checkout counts as the checkout, the deepest of nested checkouts holding it", () => {
    const checkouts = [checkout("/work/repo-a", 1, 101), checkout("/work/repo-a/inner", 2, 102)];

    expect(itemTestbedTurns([lane([entry("/work/repo-a/inner/client", "check", 30)])], checkouts, running)).toEqual([{ itemId: 2, command: "check", place: null }]);
    expect(itemTestbedTurns([lane([entry("/work/repo-ab", "check", 31)])], checkouts, running)).toEqual([]);
  });

  test("a command in a checkout no job holds, another job holds, or on a work node stands on no row", () => {
    const lanes = [lane([entry("/work/free", "check", 40), entry("/work/stale", "check", 41), entry("/work/node", "check", 42)])];
    const checkouts = [checkout("/work/free", null, null), checkout("/work/stale", 1, 999), checkout("/work/node", 2, 102, "node-a")];

    expect(itemTestbedTurns(lanes, checkouts, running)).toEqual([]);
  });

  test("one line a row: a held seat over a wait, and of waits the one nearest the front", () => {
    const checkouts = [checkout("/work/repo-a", 1, 101), checkout("/work/repo-b", 2, 102)];
    const lanes = [
      lane([], [entry("/work/repo-a", "suite", 50), entry("/work/repo-b", "check", 51), entry("/work/repo-b", "suite", 52)]),
      lane([entry("/work/repo-a", "bun run build", 53)], [], "narrow")
    ];

    expect(itemTestbedTurns(lanes, checkouts, running)).toEqual([
      { itemId: 1, command: "bun run build", place: null },
      { itemId: 2, command: "check", place: 2 }
    ]);
  });
});

describe("reading the testbed", () => {
  test("the lanes are read out of what the status verb prints, and anything else reads as none", () => {
    expect(lanesOf(STATUS)).toEqual([
      lane([entry("/work/repo-a", "cargo test", 11)], [entry("/work/repo-c", "check", 12), entry("/work/repo-b", "suite", 13)]),
      lane([], [], "narrow")
    ]);
    expect(lanesOf(null)).toEqual([]);
    expect(lanesOf({ queues: { items: "none" } })).toEqual([]);
  });

  test("the program is the one the setting names, else bmo-testbed where bmo installs its commands", () => {
    expect(testbedProgram({ TESTBED_BIN: "/opt/testbed" })).toBe("/opt/testbed");
    expect(testbedProgram({})).toEndWith("/.local/bin/bmo-testbed");
  });

  test("each running item's turn is read from the program and the agency together", async () => {
    const program = join(scratch, "bmo-testbed");

    writeFileSync(program, `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(STATUS)}\nEOF\n`);
    chmodSync(program, 0o755);
    process.env.TESTBED_BIN = program;

    try {
      expect(await readItemTestbedTurns()).toEqual([
        { itemId: 1, command: "cargo test", place: null },
        { itemId: 2, command: "suite", place: 2 }
      ]);
    } finally {
      delete process.env.TESTBED_BIN;
    }
  });

  test("a program that does not run reads as an empty queue", async () => {
    process.env.TESTBED_BIN = join(scratch, "missing");

    try {
      expect(await readItemTestbedTurns()).toEqual([]);
    } finally {
      delete process.env.TESTBED_BIN;
    }
  });
});
