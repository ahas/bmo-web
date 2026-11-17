import { describe, expect, test } from "bun:test";

import { reservedOf, runDoing, runLogPlace, runsOfAgent, turnsDoing } from "../../../apps/web/app/domain/agent-state";
import { wording } from "../../../apps/web/shared/wording";

import type { AgentRun } from "../../../apps/web/shared/agent-runs";

// What agent management's agents tab says each agent is doing now (docs/web.md, 「What each agent is doing now」).

const t = wording;

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  role: "worker",
  agent: "agent-a",
  place: "repo-a",
  path: "/srv/repo-a",
  source: "Job",
  provider: null,
  model: null,
  since: 5_000,
  title: "Title A",
  itemId: null,
  log: null,
  session: null,
  stop: null,
  ...over
});

describe("a role's agent at work", () => {
  test("reads the source that asked its run and the item's number for a job of an item, which its item names", () => {
    const doing = runDoing(t, run({ itemId: 12, provider: "provider-a", model: "model-a" }));

    expect(doing.line).toBe(`Job · ${wording("live.label.run_item", { id: 12 })}`);
    expect(doing.item).toBe(12);
    expect(doing.note).toBe("Title A");
    expect(doing.detail).toEqual(["/srv/repo-a", "provider-a · model-a"]);
    expect(doing.since).toBe(5_000);
  });

  test("reads the line naming its work where it is no job of an item, else the place it works in", () => {
    expect(runDoing(t, run({ source: "Ask" })).line).toBe("Ask · Title A");
    expect(runDoing(t, run({ source: "Ask" })).item).toBeNull();
    expect(runDoing(t, run({ source: "Ask" })).note).toBeNull();
    expect(runDoing(t, run({ title: null })).line).toBe("Job · repo-a");
  });

  test("is every run let in on that agent, the earliest first", () => {
    const runs = [run({ agent: "agent-b", since: 1 }), run({ agent: "agent-a", since: 9, title: "late" }), run({ agent: "agent-a", since: 3, title: "early" })];

    expect(runsOfAgent(runs, "agent-a").map((one) => one.title)).toEqual(["early", "late"]);
    expect(runsOfAgent(runs, "agent-c")).toEqual([]);
  });
});

describe("where a working role's agent opens its log", () => {
  test("is the run it names, else the newest lines of a role session's, else the moment it took the slot", () => {
    expect(runLogPlace({ log: "run-a", session: "session-a", since: 5_000 })).toEqual({ run: "run-a" });
    expect(runLogPlace({ log: null, session: "session-a", since: 5_000 })).toBeNull();
    expect(runLogPlace({ log: null, session: null, since: 5_000 })).toEqual({ at: 5 });
    expect(runLogPlace({ log: null, session: null, since: null })).toBeNull();
  });
});

describe("a supervisor at work", () => {
  test("is idle with no turn running", () => {
    expect(turnsDoing(t, [], String)).toBeNull();
  });

  test("names the rooms its turns run in, and opens its log at the earliest turn in that turn's room", () => {
    const doing = turnsDoing(t, [{ chatId: 7, startedAt: 200 }, { chatId: 3, startedAt: 100 }], (chatId) => `room-${chatId}`)!;

    expect(doing.line).toBe(wording("live.label.answering", { rooms: "room-3, room-7" }));
    expect(doing.since).toBe(100_000);
    expect(doing.place).toEqual({ at: 100, chat: 3 });
  });
});

describe("a role's reservations", () => {
  test("are the slots its reservation keeps, none where it keeps none", () => {
    expect(reservedOf([{ role: "worker", reserved: 2 }], "worker")).toBe(2);
    expect(reservedOf([{ role: "worker", reserved: 2 }], "search")).toBe(0);
  });
});
