import type { TodoReview } from "#shared/types";

// Every entry of one item's review, in the order it was written, read afresh each time the item's dialog asks.
export default defineEventHandler(async (event): Promise<TodoReview[]> => {
  await requireUserSession(event);

  return readTodoReviews(requireTodoId(event));
});
