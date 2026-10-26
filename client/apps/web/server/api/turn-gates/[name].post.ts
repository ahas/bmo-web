import { wording } from "#shared/wording";

import { switchGate } from "../../utils/gate";

// One gate of the turn switched on or off, where its profile lets it be (the gate unit's `docs/api.md`, 「Gates」).
// Whether it may be is the gate unit's to say; a body naming no switch goes no further.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name") ?? "";
  const body = await readBody<{ enabled?: unknown }>(event);

  if (name === "" || typeof body?.enabled !== "boolean") throw fail(400, wording("common.error.bad_action"));

  await switchGate(name, body.enabled);

  return { ok: true };
});
