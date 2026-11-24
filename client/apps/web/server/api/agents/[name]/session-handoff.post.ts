import { askedRoom, handOver, handoffReason, requireSessionSupervisor } from "../../../utils/agent-sessions";

import type { SessionActAnswer } from "#shared/types";

// A supervisor's session handed over, for a reader who may act on it (docs/web.md, 「A supervisor's session handed
// over or reset」): its reason, and the room it was asked from where it was asked from one.
export default defineEventHandler(async (event): Promise<SessionActAnswer> => {
  const name = getRouterParam(event, "name") ?? "";
  const body = await readBody<{ reason?: unknown; room?: unknown }>(event).catch(() => null);
  const reason = handoffReason(body?.reason);
  const room = askedRoom(body?.room);
  const { signed, supervisor } = await requireSessionSupervisor(event, name);

  return { outcome: await handOver(supervisor, reason, room, signed.id) };
});
