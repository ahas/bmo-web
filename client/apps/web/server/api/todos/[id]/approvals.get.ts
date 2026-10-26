import type { TodoApproval } from "#shared/types";

// Every approval of one item, newest first, as the item carries them (bmo-job's `docs/api.md`, 「Items」): each with
// the caller whose token gave it and its kind. An approval taken back is no part of the item, so only the approvals
// standing are listed.
export default defineEventHandler(async (event): Promise<TodoApproval[]> => {
  await requireUserSession(event);

  const id = requireTodoId(event);
  const item = await jobCall(job().GET("/items/{itemId}", { params: { path: { itemId: id } } }));

  return item.approvals
    .map((approval, at) => ({ id: at + 1, kind: approval.kind, caller: approval.callerName, at: Math.floor(approval.at / 1000) }))
    .sort((one, other) => other.at - one.at);
});
