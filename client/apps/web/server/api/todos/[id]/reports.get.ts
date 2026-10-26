import type { TodoReport } from "#shared/types";

// Every report bmo-job keeps of one item, the closing ones first, read afresh each time the item's dialog asks, so a
// report written while the dialog is open stands in it without the board's minute.
export default defineEventHandler(async (event): Promise<TodoReport[]> => {
  await requireUserSession(event);

  return readTodoReports(requireTodoId(event));
});
