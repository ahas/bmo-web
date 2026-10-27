import { todoModelPlan } from "../../utils/todo-models";

import type { TodoModelPlan } from "#shared/types";

// What the TODO rows name as the model their work will go out on, before any of it has run (docs/web.md, the TODO panel's section):
// each worker's own road and the road each running job of an item took, as the agency answers them.
export default defineEventHandler(async (event): Promise<TodoModelPlan> => {
  await requireUserSession(event);

  return await todoModelPlan();
});
