import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { itemBook, itemTipLines } from "../../../apps/web/app/domain/item-tips";

import type { TodoItem } from "../../../apps/web/shared/types";

// The fields the tooltip reads; the rest of a row says nothing to it.
function item(id: number, over: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: `Item ${id}`,
    approved: true, awaitingApproval: false,
    done: false,
    running: false,
    worker: null,
    heldAt: null,
    heldKind: null,
    holdPending: false,
    mergedInto: null,
    progress: null,
    stopped: null,
    doneAt: null,
    ...over
  } as TodoItem;
}

// A book whose asks are answered by hand, sent only when the test says so.
function bench(answer: (ids: number[]) => Promise<TodoItem[]>) {
  const asked: number[][] = [];
  const pending: (() => void)[] = [];
  let clock = 0;
  const book = itemBook({
    read: (ids) => {
      asked.push(ids);

      return answer(ids);
    },
    now: () => clock,
    later: (send) => pending.push(send)
  });

  return {
    book,
    asked,
    send: async () => {
      for (const send of pending.splice(0)) send();

      await Promise.resolve();
      await Promise.resolve();
    },
    pass: (ms: number) => {
      clock += ms;
    }
  };
}

describe("the book the numbers are read from", () => {
  test("asks once for every number asked in the same moment, and reads a number with no item as missing", async () => {
    const run = bench(async (ids) => ids.filter((id) => id !== 3).map((id) => item(id)));

    run.book.ask([1, 2]);
    run.book.ask([2, 3]);
    expect(run.book.reading(1)).toEqual({ kind: "unread" });

    await run.send();

    expect(run.asked).toEqual([[1, 2, 3]]);
    expect(run.book.reading(1)).toMatchObject({ kind: "item", item: { title: "Item 1" } });
    expect(run.book.reading(3)).toEqual({ kind: "missing" });
  });

  test("answers from what it holds until the reading is stale, then reads it again", async () => {
    const run = bench(async (ids) => ids.map((id) => item(id)));

    run.book.ask([1]);
    await run.send();
    run.pass(29_000);
    run.book.ask([1]);
    await run.send();
    expect(run.asked).toEqual([[1]]);

    run.pass(1_000);
    run.book.ask([1]);
    await run.send();
    expect(run.asked).toEqual([[1], [1]]);
  });

  test("keeps a reading it holds when a later read fails, and says a first read failed", async () => {
    let fail = false;
    const run = bench(async (ids) => {
      if (fail) throw new Error("down");

      return ids.filter((id) => id === 1).map((id) => item(id));
    });

    run.book.ask([1]);
    await run.send();
    fail = true;
    run.pass(30_000);
    run.book.ask([1, 2]);
    await run.send();

    expect(run.book.reading(1).kind).toBe("item");
    expect(run.book.reading(2)).toEqual({ kind: "failed" });
  });
});

describe("what the tooltip says of an item", () => {
  test("its number and title, then its worker where it names one and where it stands", () => {
    expect(itemTipLines(wording, item(1383, { title: "Console tooltip", worker: "worker-b", running: true }))).toEqual({
      head: "#1383 Console tooltip",
      detail: `worker-b · ${wording("todo.label.state_running")}`
    });
    expect(itemTipLines(wording, item(12)).detail).toBe(wording("todo.label.state_waiting"));
  });
});
