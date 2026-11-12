import { describe, expect, test } from "bun:test";

import "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Asked } from "../../support/units";

// An item's work order read from a stand-in bmo-job and laid out as the console's order: each step of the fixed
// order is one task, counted from one and run in turn, so the steps stand once each, named by their place among them.

const [first, second, third] = ["Lay out the workplace", "Place the runs", "Check on a real machine"];
const steps = [first, second, third];
const tasks = [
  { id: 9, itemId: 7, stage: 1, title: first, state: "done", assigneeName: null, changedAt: 1_790_000_000_000 },
  { id: 10, itemId: 7, stage: 2, title: second, state: "current", assigneeName: null, changedAt: 1_790_000_000_000 },
  { id: 11, itemId: 7, stage: 3, title: third, state: "waiting", assigneeName: null, changedAt: 1_790_000_000_000 }
];

standIn("JOB", (asked: Asked) => {
  const path = new URL(asked.path, "http://job").pathname;

  if (path === "/items/7/work-order") {
    return answer({ itemId: 7, purpose: "Run a PC", directive: "Do it", steps, state: "running", changedAt: 1_790_000_000_000 });
  }
  if (path === "/items/7/work-order/tasks") return answer({ items: tasks, more: false });
  if (path === "/items/7/reviews") {
    return answer({
      items: [
        { id: 1, itemId: 7, ref: "job:1", stage: 1, round: 1, kind: "report", body: "found", actorName: "agency", labels: {}, createdAt: 1 },
        { id: 2, itemId: 7, ref: "job:1", stage: 1, round: 2, kind: "rejection", body: "again", actorName: "agent-a", labels: {}, createdAt: 2 },
        { id: 3, itemId: 7, ref: "job:1", stage: 1, round: 3, kind: "rejection", body: "once more", actorName: "agent-a", labels: {}, createdAt: 3 }
      ],
      more: false
    });
  }

  return answer({ code: "not-found", error: "no such item" }, 404);
});

const { readWorkOrder, workOrderView } = await import("../../../apps/web/server/utils/work-order-view");
const { workSteps } = await import("../../../apps/web/app/domain/workorder");

describe("an item's fixed work order", () => {
  test("counts each step's rejections from the item's review, by the stage they stand under", async () => {
    const order = await readWorkOrder(7);

    expect(order?.tasks.map((task) => task.rejections)).toEqual([2, 0, 0]);
  });

  test("stands each step once, named by its place and titled by its own step, the current one alone at work", async () => {
    const order = await readWorkOrder(7);

    expect(order).not.toBeNull();
    expect(order?.stages).toEqual([]);

    const laid = workSteps((key, values) => `${key}${values ? JSON.stringify(values) : ""}`, workOrderView(order!));

    expect(laid.map((step) => [step.name, step.title, step.state])).toEqual([
      ['todo.label.step_stage_place{"n":1,"of":3}', first, "done"],
      ['todo.label.step_stage_place{"n":2,"of":3}', second, "running"],
      ['todo.label.step_stage_place{"n":3,"of":3}', third, "pending"]
    ]);
  });
});
