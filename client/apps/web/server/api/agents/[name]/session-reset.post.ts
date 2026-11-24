import { askedRoom, requireSessionSupervisor, resetSession } from "../../../utils/agent-sessions";

import type { SessionActAnswer } from "#shared/types";

// A supervisor's session reset, for a reader who may act on it (docs/web.md, 「A supervisor's session handed over or
// reset」): its session of the room named where one is, else its one session or every room session it holds.
export default defineEventHandler(async (event): Promise<SessionActAnswer> => {
  const name = getRouterParam(event, "name") ?? "";
  const body = await readBody<{ room?: unknown }>(event).catch(() => null);
  const room = askedRoom(body?.room);
  const { signed, supervisor } = await requireSessionSupervisor(event, name);

  return { outcome: await resetSession(supervisor, room, signed.id) };
});
