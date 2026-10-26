import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Asked } from "../../support/units";

// The board the TODO panel stands on, read from a stand-in bmo-job: its items, the queues they wait in, and an
// item's notes and reports. What is pinned here is how those readings become the rows the panel shows: which list
// each item stands in, what a row carries, how the conditions and a search narrow it, and what the board says of
// the queues' pause and holds.

interface Item {
  id: number;
  title: string;
  brief: string;
  queueName: string;
  priority: number;
  state: string;
  cowork: boolean;
  assigneeName: string | null;
  requesterName: string | null;
  labels: Record<string, string>;
  approvals: { actorName: string; at: number }[];
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
    cowork: false,
    assigneeName: null,
    requesterName: "owner",
    labels: {},
    approvals: [{ actorName: "owner", at: 1_790_000_000_000 }],
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
  queues: [{ name: "default", state: "open", holds: [] as Record<string, unknown>[], leasedCount: 0, openCount: 0, changedAt: 0 }]
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
      // An item filed open but not approved by the owner waits on him like a draft one.
      item(7, { state: "open", approvals: [] })
    ]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([1]);
    expect(ids(board.pending)).toEqual([2, 7]);
    expect(ids(board.held)).toEqual([6]);
    // An item merged into another is finished, and the fixed item carries no list of its own for merging ones.
    expect(ids(board.merged)).toEqual([]);
    expect(ids(board.done)).toEqual([5, 4, 3]);
    expect(board.doneTotal).toBe(3);
    expect(board.standing).toEqual({ queue: 1, running: 0, pending: 2, held: 1, merged: 0 });
  });

  test("a leased item stands in the queue and reads as running; a held one stands among the holds", async () => {
    stand([item(1, { state: "leased", leaseId: 4 }), item(2, { state: "held" })]);

    const board = await readTodoBoard();

    expect(ids(board.queue)).toEqual([1]);
    expect(board.queue.map((row) => row.running)).toEqual([true]);
    expect(ids(board.held)).toEqual([2]);
    expect(board.standing.running).toBe(1);
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
        approvals: [{ actorName: "owner", at: 1_790_000_010_000 }],
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
      brief: "rename the tooltip",
      worker: "worker-b",
      approved: true,
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

  test("an unassigned row names no worker, and an item nothing has run for carries no time", async () => {
    stand([item(9)]);

    expect(await readTodoItem(9)).toMatchObject({ worker: null, model: null, ranOn: null, seconds: null, spans: [] });
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
      item(2, { cowork: true }),
      item(3, { state: "done" }),
      item(4, { state: "done", cowork: true })
    ]);

    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, worker: "worker-b" } })).queue)).toEqual([1]);
    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, worker: "worker" } })).queue)).toEqual([2]);
    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, cowork: "on" } })).queue)).toEqual([2]);
    expect(ids((await readTodoBoard({ conditions: { ...NO_CONDITIONS, cowork: "on" } })).done)).toEqual([4]);
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
