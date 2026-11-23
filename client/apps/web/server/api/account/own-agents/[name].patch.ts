import { wording } from "#shared/wording";

import { changeOwnAgent, roadIn } from "../../../utils/own-agents";

// One of the reader's agents laid on another road, `road` null to follow the asker, or switched on or off, `enabled`
// (docs/web.md, 「Settings」, the own-agents section).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const name = getRouterParam(event, "name") ?? "";
  const body = await readBody<{ road?: unknown; enabled?: unknown }>(event).catch(() => ({}) as { road?: unknown; enabled?: unknown });
  const road = roadIn(body?.road);
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : undefined;

  if (name === "" || (road === undefined && enabled === undefined)) throw fail(400, wording("organization.error.bad_request"));

  await changeOwnAgent(await signedInUser(event), name, { road, enabled });

  return { ok: true };
});
