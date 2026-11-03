import { wording } from "#shared/wording";

import type { SupervisorPiecesView } from "#shared/axes";

// A supervisor's own settings, for one whose turns its settings' pieces make (docs/web.md, 「Agent management screen」,
// the settings dialog).
export default defineEventHandler(async (event): Promise<SupervisorPiecesView> => {
  await requireUserSession(event);

  const pieces = await readSupervisorPieces(axisName(getRouterParam(event, "name")));

  if (pieces === null) throw fail(404, wording("agents.error.supervisors_read_failed"));

  return pieces;
});
