import { job, jobCall } from "./job";

import type { Task, WorkOrder as JobWorkOrder } from "bmo-job-client";
import type { WorkOrder, WorkOrderView, WorkTask } from "#shared/types";

// One item's work order as bmo-job's fixed API reads it (bmo-job's `docs/api.md`, 「Work orders」): its purpose,
// directive, steps and state, and the tasks the steps are broken into. The console's own order carries far more —
// the roads each task ran, what it spent, the round it belongs to — and none of that is part of an item's order,
// so those stand empty (docs/boundary.md, 「Gaps the console meets」).

function taskOf(task: Task): WorkTask {
  return {
    id: String(task.id),
    title: task.title,
    role: "",
    model: "",
    instruction: task.title,
    state: task.state === "waiting" ? "pending" : task.state === "current" ? "running" : task.state,
    attempt: 1,
    unit: null,
    jobId: null,
    startedAt: null,
    result: null,
    artifact: null,
    error: null
  };
}

// Each step of the fixed order is one task, run in turn, so its tasks are the order's build steps alone and no
// design stage holds them (docs/boundary.md, 「Gaps the console meets」).
function orderOf(order: JobWorkOrder, tasks: readonly Task[]): WorkOrder {
  return {
    todoId: order.itemId,
    intent: order.purpose,
    instruction: order.directive,
    status: order.state === "draft" ? "draft" : order.state === "done" ? "done" : "active",
    phase: "implementation",
    stage: 0,
    stages: [],
    tasks: tasks.map(taskOf),
    history: [],
    control: null,
    worker: null,
    cwd: "",
    chatId: 0,
    model: "",
    error: null,
    updatedAt: Math.floor(order.changedAt / 1000)
  };
}

/** One item's work order as bmo-job reads it, or null where there is no such item. */
export async function readWorkOrder(todoId: number): Promise<WorkOrder | null> {
  try {
    const [order, tasks] = await Promise.all([
      jobCall(job().GET("/items/{itemId}/work-order", { params: { path: { itemId: todoId } } })),
      jobCall(job().GET("/items/{itemId}/work-order/tasks", { params: { path: { itemId: todoId } } }))
    ]);

    return orderOf(order, tasks.items);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

// The order with the end of every task that has one. The fixed order carries no task's end, so every task stands
// with none (docs/boundary.md, 「Gaps the console meets」).
export function workOrderView(order: WorkOrder): WorkOrderView {
  return { ...order, ended: {} };
}
