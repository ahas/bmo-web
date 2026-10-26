import { itemRunsOf } from "../../../utils/job-runs";

import type { ItemRuns } from "#shared/types";

// What the jobs that carried an item say of it — how many ran it and for how long, the road its latest answered on,
// and the plan it laid out of its own — for the TODO modal's state tab (docs/web.md). The jobs run on the item's
// worker, named in the query, or on the base worker where it names none.
export default defineEventHandler(async (event): Promise<ItemRuns> => {
  await requireUserSession(event);

  const id = requireTodoId(event);
  const worker = getQuery(event).worker;

  return await itemRunsOf(typeof worker === "string" && worker.trim() !== "" ? worker.trim() : null, id);
});
