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
  hold: { reason: string; callerName: string | null; at: number } | null;
  noticesOff: { reason: string; callerName: string | null; at: number } | null;
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
    hold: null,
    noticesOff: null,
    ...over
  };
}

const held = {
  items: [] as Item[],
  notes: new Map<number, Record<string, unknown>[]>(),
  reports: new Map<number, Record<string, unknown>[]>(),
  queues: [{ name: "default", state: "open", holds: [] as Record<string, unknown>[], leasedCount: 0, openCount: 0, changedAt: 0 }],
  jobs: [] as { id?: number; itemId: number; state: string; heldFor: string | null; agentName?: string | null }[],
  questions: [] as { id: number; itemId: number | null; addressee: "person" | "supervisor"; state: string }[]
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

  // The questions, filtered as bmo-job filters them: by state, and by addressee.
  if (url.pathname === "/questions") {
    const state = url.searchParams.get("state");
    const addressee = url.searchParams.get("addressee");

    return answer({ items: held.questions.filter((one) => one.state === state && one.addressee === addressee), more: false });
  }

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

const { readStandingNotes, readTodoBoard, readTodoItem, readTodoItems, readTodoNotes, searchedFor, doneLimit } = await import("../../../apps/web/server/utils/todos");
const { NO_CONDITIONS } = await import("../../../apps/web/app/domain/todos");

const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

describe("the lists each item stands in", () => {
  test("the queue, what waits on approval, what is set aside, what is merged, what was discarded and what is finished", async () => {
    stand([
      item(1),
      item(2, { state: "draft", approvals: [] }),
      item(3, { state: "done" }),
      item(4, { state: "merged", mergedInto: 1, endedAt: 1_790_000_030_000 }),
      // Merged into an item already finished, and so finished with it; and merged into one that was merged on.
      item(8, { state: "merged", mergedInto: 3 }),
      item(9, { state: "merged", mergedInto: 4 }),
      item(5, { state: "dropped", endedAt: 1_790_000_060_000 }),
      item(6, { state: "held" }),
      // An item that opened by itself under an unattended label carries no approval and is past approval all the same.
      item(7, { state: "open", approvals: [], labels: { lane: "pr-review" } })
    ]);
    // The note a drop was made with, and one written after it, which is no reason for it.
    held.notes.set(5, [
      { id: 4, itemId: 5, actorName: "owner", text: "carried elsewhere", createdAt: 1_790_000_060_000, labels: {} },
      { id: 5, itemId: 5, actorName: "owner", text: "a later word", createdAt: 1_790_000_090_000, labels: {} }
    ]);

    const board = await readTodoBoard();

    held.notes.delete(5);
    expect(ids(board.queue)).toEqual([1, 7]);
    expect(ids(board.pending)).toEqual([2]);
    expect(ids(board.held)).toEqual([6]);
    // An item merged into an unfinished one waits on it, through every merge between them; one whose carrier is
    // finished is finished with it.
    expect(ids(board.merged)).toEqual([4, 9]);
    expect(board.merged.map((row) => row.done)).toEqual([false, false]);
    expect(board.merged[0]).toMatchObject({ mergedInto: 1, mergedIntoTitle: "Item 1", mergedAt: 1_790_000_030 });
    expect(board.queue[0]!.mergedFrom).toEqual([{ id: 4, title: "Item 4", done: false }]);
    // What was discarded is finished without being done, so it stands apart from what was, with its reason.
    expect(ids(board.done)).toEqual([8, 3]);
    expect(board.done[0]).toMatchObject({ done: true, mergedInto: 3 });
    expect(board.doneTotal).toBe(2);
    expect(ids(board.dropped)).toEqual([5]);
    expect(board.dropped[0]).toMatchObject({ done: true, status: "dropped", dropReason: "carried elsewhere" });
    expect(board.droppedTotal).toBe(1);
    expect(board.standing).toEqual({ queue: 2, running: 0, deploy: 0, deploying: 0, pending: 1, held: 1, merged: 2 });
    expect(board.queue.find((one) => one.id === 7)).toMatchObject({ approved: false, awaitingApproval: false });
  });

  test("an item held until its merged commit's batch deployment stands in the queue as waiting, its phase read", async () => {
    stand([item(33, { state: "held", labels: { "close-phase": "waiting-batch", "close-commit": "def456", "hold-after-deploy": "def456" } })]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([33]);
    expect(board.queue[0]).toMatchObject({ deployHeld: true, closing: { phase: "waiting-batch", waiting: [{ repository: null, commit: "def456" }] } });
  });

  test("an open item whose close merged its commit is counted apart as waiting for its deployment", async () => {
    stand([
      item(34, { state: "open", labels: { "close-phase": "waiting-batch", "close-commit": "aaa111" } }),
      item(35, { state: "open", labels: { "close-phase": "waiting-live", "close-commit": "bbb222" } }),
      item(36, { state: "open" }),
      // Read from its repositories' pairs: one still checking keeps it from waiting, whatever the sum says.
      item(37, { state: "open", labels: { "close-phase": "waiting-batch", "close-phase:repo-a": "testing" } }),
      item(38, { state: "open", labels: { "close-phase:repo-a": "waiting-batch", "close-commit:repo-a": "ccc333" } })
    ]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([34, 35, 36, 37, 38]);
    expect(board.standing).toMatchObject({ queue: 5, running: 0, deploy: 3, deploying: 0 });
  });

  test("an item whose close merged counts as waiting for its deployment while its job still goes, never as running", async () => {
    stand([
      item(34, { state: "leased", labels: { "close-phase": "waiting-batch", "close-commit": "aaa111" } }),
      item(36, { state: "leased" })
    ]);
    held.jobs = [
      { id: 1, itemId: 34, state: "reviewing", heldFor: null },
      { id: 2, itemId: 36, state: "running", heldFor: null }
    ];

    expect((await readTodoBoard()).standing).toMatchObject({ queue: 2, running: 1, deploy: 1 });
  });

  test("an item its job held only until its commit goes live stands in the queue as waiting, never set aside", async () => {
    const waitingLive = { "close-phase": "waiting-live", "close-commit": "abc123", "hold-after-deploy": "abc123" };

    stand([item(31, { state: "held", labels: waitingLive }), item(32, { state: "held", labels: { "close-phase": "waiting-live" } })]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([31]);
    expect(ids(board.held)).toEqual([32]);
    expect(board.queue[0]).toMatchObject({ deployHeld: true, heldKind: null, closing: { phase: "waiting-live", waiting: [{ repository: null, commit: "abc123" }] } });
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

  test("an item the owner stopped stands in the queue until its run has ended, and among the holds after", async () => {
    stand([item(6, { state: "held" })]);
    held.notes.set(6, [{ id: 3, itemId: 6, actorName: "owner", text: "wrong direction", createdAt: 1_790_000_000_000, labels: { kind: "stop" } }]);
    held.jobs = [{ itemId: 6, state: "running", heldFor: null }];

    let board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([6]);
    expect(board.held).toEqual([]);
    expect(board.queue[0]).toMatchObject({ holdPending: true, heldKind: "stop" });
    expect(board.standing).toMatchObject({ queue: 1, running: 1, held: 0 });

    held.jobs = [];
    board = await readTodoBoard();
    expect(ids(board.queue)).toEqual([]);
    expect(ids(board.held)).toEqual([6]);
    held.notes.delete(6);
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

describe("an item read by its number among its merges", () => {
  test("a merged item waits on the unfinished item carrying it, and that item lists what was merged into it", async () => {
    stand([item(1), item(4, { state: "merged", mergedInto: 1, endedAt: 1_790_000_030_000 }), item(5, { state: "merged", mergedInto: 4 })]);

    expect(await readTodoItem(5)).toMatchObject({ done: false, mergedInto: 4, mergedIntoTitle: "Item 4" });
    expect((await readTodoItem(1))!.mergedFrom).toEqual([{ id: 4, title: "Item 4", done: false }]);
  });

  test("a merged item is finished once the item carrying it is", async () => {
    stand([item(1, { state: "done" }), item(4, { state: "merged", mergedInto: 1 })]);

    expect(await readTodoItem(4)).toMatchObject({ done: true, mergedInto: 1 });
    expect((await readTodoItem(1))!.mergedFrom).toEqual([{ id: 4, title: "Item 4", done: true }]);
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

  test("a hold's time and reason are the hold bmo-job keeps on the item, over any held report", async () => {
    held.reports.set(9, [{ id: 4, itemId: 9, actorName: "owner", kind: "held", body: "earlier hold", createdAt: 1_790_000_030_000, labels: {} }]);
    stand([item(9, { state: "held", hold: { reason: "waiting on the owner", callerName: "console", at: 1_790_000_060_000 } })]);
    expect(await readTodoItem(9)).toMatchObject({ heldAt: 1_790_000_060, heldReason: "waiting on the owner" });

    held.reports.delete(9);
  });

  test("an item's job notices switched off read with their reason and time, and null while they are on", async () => {
    stand([item(9, { noticesOff: { reason: "known, waiting on the owner", callerName: null, at: 1_790_000_070_000 } })]);
    expect(await readTodoItem(9)).toMatchObject({ noticesOff: { reason: "known, waiting on the owner", at: 1_790_000_070 } });

    stand([item(9)]);
    expect(await readTodoItem(9)).toMatchObject({ noticesOff: null });
  });

  test("a hold with none kept reads its time and reason only while it is held: a report outlives the hold it was written for", async () => {
    const report = { id: 4, itemId: 9, actorName: "owner", kind: "held", body: "not now", createdAt: 1_790_000_030_000, labels: {} };

    held.reports.set(9, [report]);
    stand([item(9, { state: "held" })]);
    expect(await readTodoItem(9)).toMatchObject({ status: "held", heldAt: 1_790_000_030, heldReason: "not now" });

    stand([item(9, { state: "open" })]);
    expect(await readTodoItem(9)).toMatchObject({ status: "open", heldAt: null, heldReason: null, heldKind: null });

    held.reports.delete(9);
  });

  test("a hold with none kept and no reason never shows an earlier hold's reason, and says when its label set it aside", async () => {
    held.reports.set(9, [{ id: 4, itemId: 9, actorName: "owner", kind: "held", body: "earlier hold", createdAt: 1_790_000_030_000, labels: {} }]);
    stand([item(9, { state: "held", labels: { "held-since": "1790000060000" } })]);
    expect(await readTodoItem(9)).toMatchObject({ heldAt: 1_790_000_060, heldReason: null });

    // A reason written for this hold is no older than the moment it was set aside.
    held.reports.set(9, [
      { id: 4, itemId: 9, actorName: "owner", kind: "held", body: "earlier hold", createdAt: 1_790_000_030_000, labels: {} },
      { id: 5, itemId: 9, actorName: "owner", kind: "held", body: "this hold", createdAt: 1_790_000_060_000, labels: {} }
    ]);
    expect(await readTodoItem(9)).toMatchObject({ heldAt: 1_790_000_060, heldReason: "this hold" });

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

    expect((await readTodoItem(9))?.closing).toEqual({ phase: "testing", waiting: [] });
    expect((await readTodoItem(10))?.closing).toEqual({ phase: "waiting-live", waiting: [{ repository: null, commit: "0123abcd" }] });
    expect((await readTodoItem(11))?.closing).toEqual({ phase: "waiting-live", waiting: [{ repository: null, commit: null }] });
    expect((await readTodoItem(12))?.closing).toBeNull();
    expect((await readTodoItem(13))?.closing).toBeNull();
  });

  // An item whose work spans repositories carries a pair for each; the pair with no repository only sums them up.
  test("where its job's close stands, out of the pair of each repository, over the pair that sums them up", async () => {
    const summed = { "close-phase": "waiting-batch", "close-commit": "aaa111" };

    stand([
      item(14, { labels: { ...summed, "close-phase:repo-b": "waiting-batch", "close-commit:repo-b": "bbb222", "close-phase:repo-a": "waiting-batch", "close-commit:repo-a": "aaa111" } }),
      item(15, { state: "leased", leaseId: 7, labels: { "close-phase": "testing", "close-phase:repo-a": "waiting-batch", "close-commit:repo-a": "aaa111", "close-phase:repo-b": "testing" } }),
      item(16, { labels: { ...summed, "close-phase:repo-a": "elsewhere" } })
    ]);

    expect((await readTodoItem(14))?.closing).toEqual({
      phase: "waiting-batch",
      waiting: [{ repository: "repo-a", commit: "aaa111" }, { repository: "repo-b", commit: "bbb222" }]
    });
    expect((await readTodoItem(15))?.closing).toEqual({ phase: "testing", waiting: [{ repository: "repo-a", commit: "aaa111" }] });
    expect((await readTodoItem(16))?.closing).toBeNull();
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
  });

  test("by an unfinished note still standing or resolved, over every finished item, the page and its total included", async () => {
    const at = 1_790_000_100_000;
    const report = (id: number, itemId: number, kind: string, actorName: string, createdAt: number, body = `${kind} ${id}`, labels: Record<string, string> = {}) =>
      ({ id, itemId, actorName, kind, body, createdAt, labels });
    const labelled = (id: number, itemId: number, createdAt: number) => report(id, itemId, "held", "worker-a", createdAt, `left by ${itemId}`, { account: "unfinished" });
    // The note a closing job wrote with its account before bmo-job labelled it, by the same writer in the same moment.
    const closed = (itemId: number, noteAt: number) => [report(itemId * 10, itemId, "held", "worker-a", noteAt, `left by ${itemId}`), report(itemId * 10 + 1, itemId, "final", "worker-a", noteAt + 400)];
    const resolvedAt = (seconds: number) => ({ unfinished_resolved_at: String(seconds), unfinished_resolution: "done in another item" });

    stand([
      item(61, { state: "done", changedAt: 61 }),
      item(62, { state: "done", changedAt: 62, labels: resolvedAt(1_790_000_200) }),
      // Carried over from the old board: the note in its label, resolved and not.
      item(63, { state: "done", changedAt: 63, labels: { unfinished: "left on the old board", ...resolvedAt(1_790_000_200) } }),
      item(64, { state: "done", changedAt: 64, labels: { unfinished: "left on the old board" } }),
      // A stop-here account its writer closed on a minute later, and a hold's reason with another's account after it.
      item(65, { state: "done", changedAt: 65 }),
      item(66, { state: "done", changedAt: 66 }),
      // Closed again with a new note after the earlier one was resolved.
      item(67, { state: "done", changedAt: 67, labels: resolvedAt(1_790_000_200) }),
      // A note on work its review has not taken yet: not finished, so it has left nothing.
      item(68, { state: "leased", changedAt: 68 }),
      // The label names the note with no account beside it, and before a later stop-here account and its close; a held
      // report with another label is no note however its account follows it.
      item(69, { state: "done", changedAt: 69 }),
      item(70, { state: "done", changedAt: 70 }),
      item(71, { state: "done", changedAt: 71 })
    ]);
    held.reports.set(61, closed(61, at));
    held.reports.set(62, closed(62, at));
    held.reports.set(65, [report(650, 65, "held", "worker-a", at), report(651, 65, "final", "worker-a", at + 60_000)]);
    held.reports.set(66, [report(660, 66, "held", "owner", at), report(661, 66, "final", "worker-a", at + 1_000)]);
    held.reports.set(67, closed(67, at + 200_000));
    held.reports.set(68, closed(68, at));
    held.reports.set(69, [labelled(690, 69, at)]);
    held.reports.set(70, [labelled(700, 70, at), report(701, 70, "held", "worker-a", at + 60_000), report(702, 70, "final", "worker-a", at + 120_000)]);
    held.reports.set(71, [report(710, 71, "held", "worker-a", at, "held 710", { lane: "todo" }), report(711, 71, "final", "worker-a", at + 400)]);

    const open = await readTodoBoard({ limit: 1, conditions: { ...NO_CONDITIONS, unfinished: "open" } });
    const resolved = await readTodoBoard({ conditions: { ...NO_CONDITIONS, unfinished: "resolved" } });

    expect(ids(open.done)).toEqual([70]);
    expect(open.doneTotal).toBe(5);
    expect(ids((await readTodoBoard({ limit: 10, conditions: { ...NO_CONDITIONS, unfinished: "open" } })).done)).toEqual([70, 69, 67, 64, 61]);
    expect([open.queue, open.pending, open.held, open.merged].flat()).toEqual([]);
    expect(ids(resolved.done)).toEqual([63, 62]);
    expect(resolved.doneTotal).toBe(2);

    const rows = new Map((await readTodoBoard({ limit: 10 })).done.map((row) => [row.id, row]));

    expect(rows.get(61)).toMatchObject({ unfinished: "left by 61", unfinishedResolvedAt: null, unfinishedResolution: null });
    expect(rows.get(62)).toMatchObject({ unfinished: "left by 62", unfinishedResolvedAt: 1_790_000_200, unfinishedResolution: "done in another item" });
    expect(rows.get(63)).toMatchObject({ unfinished: "left on the old board", unfinishedResolvedAt: 1_790_000_200 });
    expect(rows.get(65)!.unfinished).toBeNull();
    expect(rows.get(66)!.unfinished).toBeNull();
    expect(rows.get(69)!.unfinished).toBe("left by 69");
    expect(rows.get(70)!.unfinished).toBe("left by 70");
    expect(rows.get(71)!.unfinished).toBeNull();
    // The note's report stands as the note alone; a held report that is no note stands among the reports.
    expect(rows.get(61)!.reports.map((one) => one.kind)).toEqual(["final"]);
    expect(rows.get(65)!.reports.map((one) => one.kind)).toEqual(["final", "held"]);
    expect(rows.get(70)!.reports.map((one) => one.id)).toEqual([702, 701]);

    for (const id of [61, 62, 65, 66, 67, 68, 69, 70, 71]) held.reports.delete(id);
  });

  // An item waits on the owner's answer while one of its questions is put to a person and not yet settled, open or
  // stopped; one the supervisor holds, and one settled, is not his (docs/web.md, the TODO panel's section).
  test("by the items waiting on the owner's answer", async () => {
    stand([item(1), item(2), item(3), item(4), item(5)]);
    held.questions = [
      { id: 11, itemId: 1, addressee: "supervisor", state: "open" },
      { id: 12, itemId: 2, addressee: "person", state: "open" },
      { id: 13, itemId: 3, addressee: "person", state: "paused" },
      { id: 14, itemId: 4, addressee: "person", state: "answered" },
      { id: 15, itemId: null, addressee: "person", state: "open" }
    ];

    try {
      expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, question: "awaiting" } })).queue)).toEqual([2, 3]);
      expect(ids((await readTodoBoard({ conditions: NO_CONDITIONS })).queue)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      held.questions = [];
    }
  });

  test("the choices are read from every item and are not narrowed", async () => {
    stand([item(1, { assigneeName: "worker-b" }), item(2), item(3, { state: "done", requesterName: "agent-a" })]);

    const board = await readTodoBoard({ conditions: { ...NO_CONDITIONS, worker: "worker-b" } });

    expect(board.choices.workers.sort()).toEqual(["worker", "worker-b"]);
    expect(board.choices.requesters.sort()).toEqual(["agent-a", "owner"]);
  });

  test("by a search, over each item's title and brief", async () => {
    stand([item(1, { brief: "rename the tooltip" }), item(2), item(3, { state: "done", title: "the console tooltip" }), item(4, { state: "done" })]);

    const board = await readTodoBoard({ query: "tooltip" });

    expect(ids(board.queue)).toEqual([1]);
    expect(ids(board.done)).toEqual([3]);
    expect(board.doneTotal).toBe(1);
  });
});

// The notes the raising form offers beside the one being viewed: every finished item's note still standing, newest
// first, with its numbered strands; one resolved, one an unfinished item has not left yet, and an item that left none
// are not among them (docs/web.md, the TODO panel's section).
describe("the notes still standing", () => {
  test("every finished item's open note, newest first, with its numbered strands", async () => {
    const note = (id: number, itemId: number, body: string) =>
      ({ id, itemId, actorName: "worker-a", kind: "held", body, createdAt: 1_790_000_100_000, labels: { account: "unfinished" } });

    stand([
      item(81, { state: "done", changedAt: 81 }),
      item(82, { state: "done", changedAt: 82, labels: { unfinished: "left on the old board" } }),
      item(83, { state: "done", changedAt: 83, labels: { unfinished_resolved_at: "1790000200", unfinished_resolution: "done elsewhere" } }),
      item(84, { state: "leased", changedAt: 84 }),
      item(85, { state: "done", changedAt: 85 })
    ]);
    held.reports.set(81, [note(810, 81, "Two things are left:\n\n1. the tooltip\n   on hover\n2. the menu")]);
    held.reports.set(83, [note(830, 83, "settled already")]);
    held.reports.set(84, [note(840, 84, "not taken by its review yet")]);

    try {
      expect(await readStandingNotes()).toEqual([
        { id: 82, title: "Item 82", strands: [] },
        { id: 81, title: "Item 81", strands: [{ number: 1, text: "the tooltip" }, { number: 2, text: "the menu" }] }
      ]);
    } finally {
      for (const id of [81, 83, 84]) held.reports.delete(id);
    }
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
