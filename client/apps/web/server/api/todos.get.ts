import { conditionsOf } from "../../app/domain/todos";

import type { TodoBoard } from "#shared/types";

// The TODO as it stands: the queue, what is waiting on the owner, and the finished ones as far back as the
// panel has asked for, narrowed by whatever conditions it carries, as bmo-job reads them. A search reaches
// every open item, not the page in hand.
export default defineEventHandler(async (event): Promise<TodoBoard> => {
  await requireUserSession(event);

  const query = getQuery(event);

  return readTodoBoard({
    limit: doneLimit(query.done),
    query: searchedFor(query.q),
    conditions: conditionsOf(query)
  });
});
