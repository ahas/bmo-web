import { wording } from "#shared/wording";

import { unitNumber } from "../../../../utils/organization";
import { addUnitRepository } from "../../../../utils/organisation-agents";
import { orgAgentsFailure } from "../../../../utils/organisation-supply";

// A repository added under a unit, in the reader's name (docs/web.md, 「Organisation」, the agents tab): `name`,
// `path`, the base checkout's directory, and `label`, or none.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ name?: unknown; label?: unknown; path?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  const label = typeof body?.label === "string" && body.label.trim() !== "" ? body.label.trim() : null;

  if (name === "" || path === "") throw fail(400, wording("organization.error.bad_request"));

  try {
    await addUnitRepository(event, unit, { name, label, path });
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
