import { HISTORY_FIRST_SPAN, isHistorySpan } from "#shared/hardware";
import { wording } from "#shared/wording";

import type { HistoryRange } from "#shared/types";

// One span of a machine's record, the one `span` names or the one a card opens on (docs/web.md, 「Monitor screen」).
export default defineEventHandler(async (event): Promise<HistoryRange> => {
  await requireUserSession(event);

  const span = getQuery(event).span ?? HISTORY_FIRST_SPAN;

  if (!isHistorySpan(span)) throw fail(400, wording("hardware.error.bad_span"));

  return await machineHistory(machineNamed(getRouterParam(event, "name")), span);
});
