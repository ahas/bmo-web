import { wording } from "#shared/wording";

import type { WorkOrderView } from "#shared/types";

interface OrderBody {
  action?: unknown;
  intent?: unknown;
  instruction?: unknown;
  task?: unknown;
  why?: unknown;
}

// A change to one item's work order, made by bmo-job under the order's lock: saved whole, moved to another state,
// or one of its tasks moved. It answers the order as it now stands, and a refusal is said in the pack's words for
// its code.
export default defineEventHandler(async (event): Promise<WorkOrderView> => {
  await requireUserSession(event);

  const id = requireTodoId(event);
  const body = await readBody<OrderBody>(event);
  const action = typeof body?.action === "string" ? body.action : "";
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";

  if (typeof body?.task === "string" || typeof body?.task === "number") {
    const taskId = Number(body.task);

    if (!Number.isSafeInteger(taskId)) throw fail(400, wording("todo.error.bad_action"));

    const state = action === "skip" ? "skipped" : action === "restore" || action === "rerun" ? "waiting" : null;

    if (state === null) throw fail(400, wording("todo.error.bad_action"));

    await jobCall(job().PATCH("/items/{itemId}/work-order/tasks/{taskId}", {
      params: { path: { itemId: id, taskId } },
      body: { state }
    }));
  } else if (action === "save" || action === "reopen") {
    const current = await jobCall(job().GET("/items/{itemId}/work-order", { params: { path: { itemId: id } } })).catch(() => null);
    const purpose = typeof body.intent === "string" ? body.intent.trim() : "";

    await jobCall(job().PUT("/items/{itemId}/work-order", {
      params: { path: { itemId: id } },
      body: { purpose, directive: instruction, steps: current?.steps ?? [instruction], state: "saved" }
    }));
  } else if (action === "resume" || action === "close") {
    await jobCall(job().PATCH("/items/{itemId}/work-order", {
      params: { path: { itemId: id } },
      body: { state: action === "resume" ? "running" : "done" }
    }));
  } else {
    throw fail(400, wording("todo.error.bad_action"));
  }

  const order = await readWorkOrder(id);

  if (order === null) throw fail(404, wording("todo.error.bad_item_id"));

  return workOrderView(order);
});
