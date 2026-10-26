import { turnGates } from "../utils/gate";

import type { TurnGateView } from "#shared/types";

// The gates a turn passes, as the gate unit serves them (docs/web.md, the agents page's gates tab).
export default defineEventHandler(async (event): Promise<TurnGateView[]> => {
  await requireUserSession(event);

  return await turnGates();
});
