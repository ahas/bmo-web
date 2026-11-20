import { beforeEach, describe, expect, test } from "bun:test";

import "../../support/nitro";
import { wording } from "../../../apps/web/shared/wording";
import { answer, standIn } from "../../support/units";

import type { Asked } from "../../support/units";

// An unfinished note resolved on its own once the lines raised from it are done (docs/web.md, the TODO panel's
// section, on a note resolving on its own), against a stand-in bmo-job: which notes a pass resolves, with which
// reason, and which it leaves standing; and the board reading a line raised after a resolution as opening the note
// again.

const NOTE_AT = 1_790_000_000_000;

interface Item {
  id: number;
  state: string;
  labels: Record<string, string>;
  createdAt: number;
  mergedInto: number | null;
  [field: string]: unknown;
}

function item(id: number, over: Partial<Item> = {}): Item {
  return {
    id,
    title: `Item ${id}`,
    brief: `Do item ${id}`,
    queueName: "default",
    priority: id,
    state: "done",
    assigneeName: null,
    requesterName: "owner",
    labels: {},
    approvals: [],
    createdAt: NOTE_AT + id * 1_000,
    changedAt: NOTE_AT + id * 1_000,
    endedAt: null,
    leaseId: null,
    mergedInto: null,
    position: id,
    scope: null,
    hold: null,
    noticesOff: null,
    rejections: 0,
    ...over
  };
}

// A line raised from notes, as the console and `todo --add --from-todo` write it.
const line = (id: number, from: string, over: Partial<Item> = {}) => item(id, { ...over, labels: { "from-todo": from, ...over.labels } });

// The note an item's closing left, labelled as bmo-job labels it.
const note = (itemId: number, body: string) => [{ id: itemId * 10, itemId, kind: "held", body, actorName: "worker-a", createdAt: NOTE_AT, labels: { account: "unfinished" } }];

const held = { items: [] as Item[], reports: new Map<number, Record<string, unknown>[]>() };

const job = standIn("JOB", (asked: Asked) => {
  const url = new URL(asked.path, "http://job");
  const one = /^\/items\/(\d+)(\/reports|\/notes)?$/.exec(url.pathname);

  if (url.pathname === "/items") {
    const ids = url.searchParams.get("ids");
    const label = url.searchParams.get("label");
    const state = url.searchParams.get("state");
    const items = held.items.filter((row) =>
      (ids === null || ids.split(",").includes(String(row.id))) && (label === null || label in row.labels) && (state === null || row.state === state));

    return answer({ items, more: false });
  }

  if (one !== null) {
    const id = Number(one[1]);
    const row = held.items.find((entry) => entry.id === id);

    if (one[2] === "/reports") return answer({ items: held.reports.get(id) ?? [], more: false });
    if (one[2] === "/notes") return answer({ items: [], more: false });
    if (row === undefined) return answer({ code: "not-found", error: "no such item" }, 404);

    if (asked.method === "PATCH") Object.assign(row, asked.body);

    return answer(row);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

standIn("AGENCY", () => answer({ items: [], more: false }));

const { finishesALine, oneAtATime, settleRaisedNotes } = await import("../../../apps/web/server/utils/note-settling");
const { readTodoItem } = await import("../../../apps/web/server/utils/todos");

const RESOLVED_AT = 1_790_100_000;
const now = () => RESOLVED_AT * 1000;

// The labels the pass wrote on an item, or null where it wrote none.
const written = (id: number) => job.asked.find((one) => one.method === "PATCH" && one.path === `/items/${id}`)?.body?.labels ?? null;

beforeEach(() => {
  job.asked.length = 0;
  held.reports = new Map();
});

describe("a pass over the lines raised from notes", () => {
  test("resolves a note whose lines, those not dropped, are all done and take up every strand, naming them", async () => {
    held.items = [
      item(1, { labels: { kind: "fix" } }),
      line(11, "1:1", { state: "done" }),
      line(12, "1:2,2", { state: "merged", mergedInto: 13 }),
      item(13, { state: "done" }),
      line(14, "1:2", { state: "dropped" }),
      item(2),
      item(3),
      line(31, "3:1", { state: "done" }),
      line(32, "3:2", { state: "dropped" }),
      item(4),
      line(41, "4", { state: "open" }),
      item(5),
      line(51, "5", { state: "done" })
    ];
    held.reports.set(1, note(1, "1. first strand\n2. second strand"));
    held.reports.set(2, note(2, "Left as prose."));
    held.reports.set(3, note(3, "1. first strand\n2. second strand"));
    held.reports.set(4, note(4, "Left as prose."));

    expect((await settleRaisedNotes(now)).sort()).toEqual([1, 2]);
    expect(written(1)).toEqual({
      kind: "fix",
      unfinished_resolved_at: String(RESOLVED_AT),
      unfinished_resolution: wording("todo.message.resolved_by_lines", { lines: "#11, #12" })
    });
    expect(written(2)).toMatchObject({ unfinished_resolution: wording("todo.message.resolved_by_lines", { lines: "#12" }) });
    // A strand only a dropped line took up, a line still open, and an item that left no note stand as they were.
    expect([written(3), written(4), written(5)]).toEqual([null, null, null]);
  });

  test("passes over a note already resolved after its lines without reading it, and one whose item is not finished", async () => {
    held.items = [
      item(1, { labels: { unfinished_resolved_at: String(RESOLVED_AT - 10), unfinished_resolution: "by hand" } }),
      line(11, "1", { state: "done" }),
      item(2, { state: "open" }),
      line(21, "2", { state: "done" })
    ];
    held.reports.set(2, note(2, "Left as prose."));

    expect(await settleRaisedNotes(now)).toEqual([]);
    expect(job.asked.some((one) => one.path.startsWith("/items/1/") || one.method === "PATCH")).toBe(false);
  });

  test("a line raised after the resolution opens the note again, and its finishing resolves it again naming every line", async () => {
    const resolved = { unfinished_resolved_at: String(RESOLVED_AT - 100), unfinished_resolution: "by hand" };
    const later = (RESOLVED_AT - 50) * 1000;

    held.items = [item(1, { labels: resolved }), line(11, "1", { state: "done" }), line(12, "1", { state: "open", createdAt: later })];
    held.reports.set(1, note(1, "Left as prose."));

    expect(await readTodoItem(1)).toMatchObject({ unfinishedResolvedAt: null, unfinishedResolution: null });
    expect(await settleRaisedNotes(now)).toEqual([]);

    held.items[2]!.state = "dropped";
    // A dropped line opens nothing: the hand's resolution stands again.
    expect(await readTodoItem(1)).toMatchObject({ unfinishedResolvedAt: RESOLVED_AT - 100, unfinishedResolution: "by hand" });

    held.items[2]!.state = "done";
    expect(await settleRaisedNotes(now)).toEqual([1]);
    expect(written(1)).toMatchObject({ unfinished_resolution: wording("todo.message.resolved_by_lines", { lines: "#11, #12" }) });
    expect(await readTodoItem(1)).toMatchObject({ unfinishedResolvedAt: RESOLVED_AT });
  });
});

describe("what sets a pass going", () => {
  test("an item moved into a finished state, and nothing else", () => {
    const changed = (state: string, previousState: string | null) => ({ kind: "item.changed", data: { state, previousState } });

    expect(["done", "dropped", "merged"].map((state) => finishesALine(changed(state, "leased")))).toEqual([true, true, true]);
    expect(finishesALine(changed("done", null))).toBe(false);
    expect(finishesALine(changed("done", "done"))).toBe(false);
    expect(finishesALine(changed("open", "draft"))).toBe(false);
    expect(finishesALine({ kind: "item.created", data: { state: "done", previousState: "open" } })).toBe(false);
  });

  test("a pass asked for while one runs runs once more after it, however often it was asked", async () => {
    let runs = 0;
    let release: () => void = () => {};
    const pass = oneAtATime(async () => {
      runs += 1;
      if (runs === 1) await new Promise<void>((resolve) => (release = resolve));
    }, () => {});
    const first = pass();
    const asked = [pass(), pass(), pass()];

    release();
    await Promise.all([first, ...asked]);

    expect(runs).toBe(2);
  });
});
