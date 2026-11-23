import { wording } from "#shared/wording";

import { addOwnAgent, roadIn } from "../../utils/own-agents";

// An agent of the reader's own added to a role: `role`, and `road` where they name one (docs/web.md, 「Settings」, the
// own-agents section).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<{ role?: unknown; road?: unknown }>(event).catch(() => ({}) as { role?: unknown; road?: unknown });
  const role = typeof body?.role === "string" && body.role !== "" ? body.role : null;

  if (role === null) throw fail(400, wording("organization.error.bad_request"));

  const road = roadIn(body?.road);

  await addOwnAgent(await signedInUser(event), role, road ?? undefined);

  return { ok: true };
});
