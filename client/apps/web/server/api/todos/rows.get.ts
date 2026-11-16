import type { TodoBoardRow } from "#shared/types";

// How many numbers one ask may carry: the items a burst of the job service's words named.
const ROWS_LIMIT = 50;

function idsOf(value: unknown): number[] {
  const raw = typeof value === "string" ? value.split(",") : [];

  return raw.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, ROWS_LIMIT);
}

// Some lines of the TODO board, each as the board reads it and with the list it stands in, asked as `?ids=1,2,3`: what
// the panel reads on a word naming the items it moved, rather than the whole board (docs/web.md, the TODO panel's
// section).
export default defineEventHandler(async (event): Promise<TodoBoardRow[]> => {
  await requireUserSession(event);

  return readBoardRows(idsOf(getQuery(event).ids));
});
