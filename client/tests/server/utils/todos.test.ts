import { afterEach, describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Asked } from "../../support/units";

// The board the TODO panel stands on, read from a stand-in bmo-job: its items, the queues they wait in, and an
// item's notes and reports; and from a stand-in agency, the jobs under way for them. What is pinned here is how those readings become the rows the panel shows: which list
// each item stands in, what a row carries, how the conditions and a search narrow it, and what the board says of
// the queues' pause and holds.

interface Item {
  id: number;
  title: string;
  brief: string;
  queueName: string;
  priority: number;
  state: string;
  assigneeName: string | null;
  requesterName: string | null;
  labels: Record<string, string>;
  approvals: { callerName: string | null; kind: "approval" | "recommendation"; at: number }[];
  createdAt: number;
  changedAt: number;
  endedAt: number | null;
  leaseId: number | null;
  mergedInto: number | null;
  position: number;
  scope: string | null;
}

function item(id: number, over: Partial<Item> = {}): Item {
  return {
    id,
    title: `Item ${id}`,
    brief: `Do item ${id}`,
    queueName: "default",
    priority: id,
    state: "open",
    assigneeName: null,
    requesterName: "owner",
    labels: {},
    approvals: [{ callerName: "owner", kind: "approval", at: 1_790_000_000_000 }],
    createdAt: 1_790_000_000_000,
    changedAt: 1_790_000_000_000,
    endedAt: null,
    leaseId: null,
    mergedInto: null,
    position: id,
    scope: null,
    ...over
  };
}

const held = {
  items: [] as Item[],
  notes: new Map<number, Record<string, unknown>[]>(),
  reports: new Map<number, Record<string, unknown>[]>(),
  queues: [{ name: "default", state: "open", holds: [] as Record<string, unknown>[], leasedCount: 0, openCount: 0, changedAt: 0 }],
  jobs: [] as { id?: number; itemId: number; state: string; heldFor: string | null; agentName?: string | null }[]
};

function stand(items: Item[]): void {
  held.items = items;
}

const job = standIn("JOB", (asked: Asked) => {
  const url = new URL(asked.path, "http://job");
  const one = /^\/items\/(\d+)(\/notes|\/reports)?$/.exec(url.pathname);

  if (url.pathname === "/items") {
    const ids = url.searchParams.get("ids");

    return answer({ items: ids === null ? held.items : held.items.filter((row) => ids.split(",").includes(String(row.id))), more: false });
  }

  if (one !== null) {
    const id = Number(one[1]);
    const row = held.items.find((entry) => entry.id === id);

    if (one[2] === "/notes") return answer({ items: held.notes.get(id) ?? [], more: false });
    if (one[2] === "/reports") return answer({ items: held.reports.get(id) ?? [], more: false });

    return row === undefined ? answer({ code: "not-found", error: "no such item" }, 404) : answer(row);
  }

  if (url.pathname === "/queues") return answer({ items: held.queues, more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});

// The agency answers the jobs under way, its `running` filter asking for those starting, running or reviewing.
const agency = standIn("AGENCY", (asked: Asked) => {
  const url = new URL(asked.path, "http://agency");

  if (url.pathname !== "/jobs") return answer({ code: "no-route", error: "no route" }, 404);

  const itemId = url.searchParams.get("itemId");

  return answer({ items: held.jobs.filter((one) => itemId === null || String(one.itemId) === itemId), more: false });
});

afterEach(() => {
  held.jobs = [];
});

const { readTodoBoard, readTodoItem, readTodoItems, readTodoNotes, searchedFor, doneLimit } = await import("../../../apps/web/server/utils/todos");
const { NO_CONDITIONS } = await import("../../../apps/web/app/domain/todos");

const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

describe("the lists each item stands in", () => {
  test("the queue, what waits on approval, what is set aside, what is merged and what is finished", async () => {
    stand([
      item(1),
      item(2, { state: "draft", approvals: [] }),
      item(3, { state: "done" }),
      item(4, { state: "merged", mergedInto: 1 }),
      item(5, { state: "dropped", endedAt: 1_790_000_060_000 }),
      item(6, { state: "held" }),
      // An item that opened by itself under an unattended label carries no approval and is past approval all the same.
      item(7, { state: "open", approvals: [], labels: { lane: "pr-review" } })
    ]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([1, 7]);
    expect(ids(board.pending)).toEqual([2]);
    expect(ids(board.held)).toEqual([6]);
    // An item merged into another is finished, and the fixed item carries no list of its own for merging ones.
    expect(ids(board.merged)).toEqual([]);
    expect(ids(board.done)).toEqual([5, 4, 3]);
    expect(board.doneTotal).toBe(3);
    expect(board.standing).toEqual({ queue: 2, running: 0, deploy: 0, deploying: 0, pending: 1, held: 1, merged: 0 });
    expect(board.queue.find((one) => one.id === 7)).toMatchObject({ approved: false, awaitingApproval: false });
  });

  test("an item held until its merged commit's batch deployment stands in the queue as waiting, its phase read", async () => {
    stand([item(33, { state: "held", labels: { "close-phase": "waiting-batch", "close-commit": "def456", "hold-after-deploy": "def456" } })]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([33]);
    expect(board.queue[0]).toMatchObject({ deployHeld: true, closing: { phase: "waiting-batch", commit: "def456" } });
  });

  test("an open item whose close merged its commit is counted apart as waiting for its deployment", async () => {
    stand([
      item(34, { state: "open", labels: { "close-phase": "waiting-batch", "close-commit": "aaa111" } }),
      item(35, { state: "open", labels: { "close-phase": "waiting-live", "close-commit": "bbb222" } }),
      item(36, { state: "open" })
    ]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([34, 35, 36]);
    expect(board.standing).toMatchObject({ queue: 3, running: 0, deploy: 2, deploying: 0 });
  });

  test("an item its job held only until its commit goes live stands in the queue as waiting, never set aside", async () => {
    const waitingLive = { "close-phase": "waiting-live", "close-commit": "abc123", "hold-after-deploy": "abc123" };

    stand([item(31, { state: "held", labels: waitingLive }), item(32, { state: "held", labels: { "close-phase": "waiting-live" } })]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([31]);
    expect(ids(board.held)).toEqual([32]);
    expect(board.queue[0]).toMatchObject({ deployHeld: true, heldKind: null, closing: { phase: "waiting-live", commit: "abc123" } });
  });

  test("a draft waits on the owner, one the chat agent recommended among them; an approved one stands in the queue", async () => {
    stand([
      item(11, { state: "draft", approvals: [{ callerName: "chat", kind: "recommendation", at: 1_790_000_000_000 }] }),
      item(12, { state: "open", approvals: [{ callerName: "chat", kind: "recommendation", at: 1_790_000_000_000 }, { callerName: "ahas", kind: "approval", at: 1_790_000_001_000 }] })
    ]);

    const board = await readTodoBoard();

    expect(ids(board.pending)).toEqual([11]);
    expect(board.pending[0]).toMatchObject({ approved: false, awaitingApproval: true, recommended: true });
    expect(ids(board.queue)).toEqual([12]);
    expect(board.queue[0]).toMatchObject({ approved: true, awaitingApproval: false, recommended: true });
  });

  test("an unattended item that is leased and running stands in the queue as running, never among what waits on approval", async () => {
    stand([item(21, { state: "leased", leaseId: 9, approvals: [], labels: { lane: "pr-review" } })]);
    held.jobs = [{ itemId: 21, state: "running", heldFor: null }];

    const board = await readTodoBoard();

    expect(ids(board.pending)).toEqual([]);
    expect(ids(board.queue)).toEqual([21]);
    expect(board.queue[0]).toMatchObject({ running: true, approved: false, awaitingApproval: false });
  });

  test("a leased item stands in the queue; a held one stands among the holds", async () => {
    stand([item(1, { state: "leased", leaseId: 4 }), item(2, { state: "held" })]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([1]);
    expect(board.queue.map((row) => row.running)).toEqual([true]);
    expect(ids(board.held)).toEqual([2]);
    // A plain hold has no kind of its own, so it reads as a plain hold rather than a wind-down.
    expect(board.held[0]!.heldKind).toBeNull();
  });

  test("a leased item's live state is its job's: none before the job is written, waiting while it waits for a seat", async () => {
    stand([1, 2, 3, 4, 5].map((id) => item(id, { state: "leased", leaseId: id })));
    held.jobs = [
      { itemId: 2, state: "starting", heldFor: "it waits for the agent agent-a of the coder role" },
      { itemId: 3, state: "starting", heldFor: null },
      { itemId: 4, state: "running", heldFor: null },
      { itemId: 5, state: "reviewing", heldFor: null }
    ];

    const board = await readTodoBoard();

    expect(agency.asked.at(-1)?.path).toContain("running=true");
    expect(board.queue.map((row) => [row.id, row.liveState])).toEqual([[1, null], [2, "waiting"], [3, "starting"], [4, "running"], [5, "running"]]);
    // The running tab counts the lines a job works on, never one leased with no job yet or one waiting for its seat.
    expect(board.standing).toMatchObject({ queue: 5, running: 3 });
    expect((await readTodoItem(2))?.liveState).toBe("waiting");
    expect((await readTodoItems([1, 5])).map((row) => row.liveState)).toEqual([null, "running"]);
  });

  test("a running job's row names the agent the job runs on, never the item's label", async () => {
    stand([
      item(1, { state: "leased", leaseId: 1, labels: { agent: "agent-b" } }),
      item(2, { state: "open", labels: { agent: "agent-b" } })
    ]);
    held.jobs = [{ id: 40, itemId: 1, state: "running", heldFor: null, agentName: "agent-a" }];

    const board = await readTodoBoard();

    expect(board.queue.map((row) => [row.id, row.agent, row.jobAgent])).toEqual([[1, "agent-b", "agent-a"], [2, "agent-b", null]]);
    expect((await readTodoItem(1))?.jobAgent).toBe("agent-a");
  });

  test("a row assigned by a model reads its model and role, and the agent its running job took", async () => {
    stand([
      item(1, { state: "leased", leaseId: 1, labels: { model: "model-a", role: "role-a" } }),
      item(2, { state: "open", labels: { model: "model-a", role: "role-a" } }),
      item(3, { state: "open", labels: { model: "auto", role: "" } })
    ]);
    held.jobs = [{ id: 41, itemId: 1, state: "running", heldFor: null, agentName: "agent-a" }];

    const board = await readTodoBoard();

    expect(board.queue.map((row) => [row.id, row.agent, row.model, row.role, row.jobAgent])).toEqual([
      [1, null, "model-a", "role-a", "agent-a"],
      [2, null, "model-a", "role-a", null],
      [3, null, null, null, null]
    ]);
  });

  test("the finished list is read as far back as the panel asked, and counted whole", async () => {
    stand([1, 2, 3, 4].map((id) => item(id, { state: "done" })));
    job.asked.length = 0;

    const board = await readTodoBoard({ limit: 2 });

    expect(ids(board.done)).toEqual([4, 3]);
    expect(board.doneTotal).toBe(4);
    expect(job.asked.some((one) => one.path === "/items?limit=500")).toBe(true);
  });
});

describe("what a row carries", () => {
  test("its brief, its worker, the account of its work, its last words and its moments", async () => {
    stand([
      item(9, {
        brief: "rename the tooltip",
        assigneeName: "worker-b",
        approvals: [{ callerName: "owner", kind: "approval", at: 1_790_000_010_000 }],
        createdAt: 1_790_000_000_000,
        endedAt: 1_790_000_090_000
      })
    ]);
    held.notes.set(9, [{ id: 3, itemId: 9, actorName: "owner", text: "also this", createdAt: 1_790_000_000_000, labels: {} }]);
    held.reports.set(9, [
      { id: 1, itemId: 9, actorName: "worker-b", kind: "progress", body: "going", createdAt: 1_790_000_020_000, labels: {} },
      { id: 2, itemId: 9, actorName: "worker-b", kind: "final", body: "done as asked", createdAt: 1_790_000_080_000, labels: {} }
    ]);

    const row = await readTodoItem(9);

    expect(row).toMatchObject({
      id: 9,
      instruction: "rename the tooltip",
      worker: "worker-b",
      approved: true, awaitingApproval: false,
      note: "also this",
      reports: [
        { id: 2, kind: "final", body: "done as asked", actor: "worker-b", at: 1_790_000_080 },
        { id: 1, kind: "progress", body: "going", actor: "worker-b", at: 1_790_000_020 }
      ],
      createdAt: 1_790_000_000,
      doneAt: 1_790_000_090
    });

    held.notes.delete(9);
    held.reports.delete(9);
  });

  test("a hold's time and reason only while it is held: a report outlives the hold it was written for", async () => {
    const report = { id: 4, itemId: 9, actorName: "owner", kind: "held", body: "not now", createdAt: 1_790_000_030_000, labels: {} };

    held.reports.set(9, [report]);
    stand([item(9, { state: "held" })]);
    expect(await readTodoItem(9)).toMatchObject({ status: "held", heldAt: 1_790_000_030, heldReason: "not now" });

    stand([item(9, { state: "open" })]);
    expect(await readTodoItem(9)).toMatchObject({ status: "open", heldAt: null, heldReason: null, heldKind: null });

    held.reports.delete(9);
  });

  test("an unassigned row names no worker, and an item nothing has run for carries no time", async () => {
    stand([item(9)]);

    expect(await readTodoItem(9)).toMatchObject({ worker: null, model: null, ranOn: null, seconds: null, spans: [] });
  });

  test("where its job's close stands, out of the two labels the close writes, and nothing where they say neither", async () => {
    stand([
      item(9, { state: "leased", leaseId: 4, labels: { "close-phase": "testing" } }),
      item(10, { state: "leased", leaseId: 5, labels: { "close-phase": "waiting-live", "close-commit": "0123abcd" } }),
      item(11, { state: "leased", leaseId: 6, labels: { "close-phase": "waiting-live" } }),
      item(12, { labels: { "close-phase": "elsewhere", "close-commit": "0123abcd" } }),
      item(13)
    ]);

    expect((await readTodoItem(9))?.closing).toEqual({ phase: "testing", commit: null });
    expect((await readTodoItem(10))?.closing).toEqual({ phase: "waiting-live", commit: "0123abcd" });
    expect((await readTodoItem(11))?.closing).toEqual({ phase: "waiting-live", commit: null });
    expect((await readTodoItem(12))?.closing).toBeNull();
    expect((await readTodoItem(13))?.closing).toBeNull();
  });

  test("the words added to an item are its notes, oldest first", async () => {
    stand([item(9)]);
    held.notes.set(9, [{ id: 3, itemId: 9, actorName: "owner", text: "also this", createdAt: 1_790_000_000_000, labels: {} }]);

    expect(await readTodoNotes(9)).toMatchObject([{ id: 3, todoId: 9, author: "owner", text: "also this", addedAt: 1_790_000_000 }]);

    held.notes.delete(9);
  });

  test("numbers with no item behind them are left out, and the rest come in number order", async () => {
    stand([item(1), item(2)]);

    expect(ids(await readTodoItems([2, 99, 1, 2]))).toEqual([1, 2]);
    expect(await readTodoItem(99)).toBeNull();
  });
});

describe("the reports a row carries on the board", () => {
  const reportsOf = (id: number) => job.asked.filter((one) => one.path === `/items/${id}/reports`).length;

  test("each finished item of the page and each held one carries every report, the closing one first", async () => {
    stand([item(21, { state: "done", changedAt: 5 }), item(22, { state: "held", changedAt: 5 }), item(23, { state: "open" })]);
    held.reports.set(21, [
      { id: 7, itemId: 21, actorName: "worker", kind: "progress", body: "half", createdAt: 1_790_000_010_000, labels: {} },
      { id: 8, itemId: 21, actorName: "worker", kind: "final", body: "all done", createdAt: 1_790_000_020_000, labels: {} }
    ]);
    held.reports.set(22, [{ id: 9, itemId: 22, actorName: "owner", kind: "held", body: "wait", createdAt: 1_790_000_030_000, labels: {} }]);
    job.asked.length = 0;

    const board = await readTodoBoard();

    expect(board.done[0]!.reports.map((one) => [one.kind, one.body])).toEqual([["final", "all done"], ["progress", "half"]]);
    expect(board.held[0]!.reports.map((one) => one.kind)).toEqual(["held"]);
    expect(board.held[0]!.heldReason).toBe("wait");
    expect(reportsOf(23)).toBe(0);
  });

  test("a reading stands while the item is unchanged, and an item that changed is read again", async () => {
    stand([item(31, { state: "done", changedAt: 5 })]);
    held.reports.set(31, [{ id: 10, itemId: 31, actorName: "worker", kind: "final", body: "first", createdAt: 1_790_000_000_000, labels: {} }]);
    job.asked.length = 0;

    await readTodoBoard();
    await readTodoBoard();
    expect(reportsOf(31)).toBe(1);

    stand([item(31, { state: "done", changedAt: 6 })]);
    await readTodoBoard();
    expect(reportsOf(31)).toBe(2);

    held.reports.delete(31);
  });
});

describe("the board narrowed", () => {
  test("by a worker, an unassigned row being the built-in worker's, and co-work", async () => {
    stand([
      item(1, { assigneeName: "worker-b" }),
      item(2),
      item(3, { state: "done" }),
      item(4, { state: "done" })
    ]);

    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, worker: "worker-b" } })).queue)).toEqual([1]);
    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, worker: "worker" } })).queue)).toEqual([2]);
    // The fixed item carries no unfinished note, so a condition on one is met by no row.
    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, unfinished: "open" } })).done)).toEqual([]);
  });

  test("the choices are read from every item and are not narrowed, and no standing note stands", async () => {
    stand([item(1, { assigneeName: "worker-b" }), item(2), item(3, { state: "done", requesterName: "agent-a" })]);

    const board = await readTodoBoard({ conditions: { ...NO_CONDITIONS, worker: "worker-b" } });

    expect(board.choices.workers.sort()).toEqual(["worker", "worker-b"]);
    expect(board.choices.requesters.sort()).toEqual(["agent-a", "owner"]);
    expect(board.standingNotes).toEqual([]);
  });

  test("by a search, over each item's title and brief", async () => {
    stand([item(1, { brief: "rename the tooltip" }), item(2), item(3, { state: "done", title: "the console tooltip" }), item(4, { state: "done" })]);

    const board = await readTodoBoard({ query: "tooltip" });

    expect(ids(board.queue)).toEqual([1]);
    expect(ids(board.done)).toEqual([3]);
    expect(board.doneTotal).toBe(1);
  });
});

describe("the queues' pause and hold", () => {
  test("the owner's pause and a deployment's hold ride on the board", async () => {
    stand([item(1)]);
    held.queues = [{ name: "default", state: "paused", holds: [{ actorName: "deploy", reason: "a job", until: 20_000 }], leasedCount: 0, openCount: 0, changedAt: 0 }];

    const board = await readTodoBoard();

    held.queues = [{ name: "default", state: "open", holds: [], leasedCount: 0, openCount: 0, changedAt: 0 }];
    expect(board.paused).toBe(true);
    expect(board.deployHold).toEqual({ since: 0, until: 20, commits: [], breaks: null, waitingOn: ["a job"], waitingFor: null, passing: [] });
    expect((await readTodoBoard()).deployHold).toBeNull();
  });
});

describe("what a caller asks for", () => {
  test("whitespace alone is no search, and a search is cut to its limit", () => {
    expect(searchedFor("   ")).toBeNull();
    expect(searchedFor(undefined)).toBeNull();
    expect(searchedFor(" tip ")).toBe("tip");
    expect(searchedFor("x".repeat(500))?.length).toBe(200);
  });

  test("how many finished items to read, within the most there is", () => {
    expect(doneLimit("40")).toBe(40);
    expect(doneLimit("0")).toBe(20);
    expect(doneLimit("nonsense")).toBe(20);
    expect(doneLimit("100000")).toBe(500);
  });
});
