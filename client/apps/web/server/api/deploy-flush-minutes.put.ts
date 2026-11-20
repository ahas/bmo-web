import { deployFlushOf } from "../utils/deploy-flush";
import { wording } from "#shared/wording";

import type { DeployFlushView } from "#shared/deploy-flush";

// The minutes between two flushes of the deploy queue changed (the agency's `docs/api.md`, 「settings」): a number, or
// null to return to the agency's own. Which numbers it takes is the agency's to say, so any number goes to it as
// written and its refusal of the field is said by the pack's sentence for that field. The answer is the minutes the
// agency then holds in force.
export default defineEventHandler(async (event): Promise<DeployFlushView> => {
  await requireAdministrator(event);

  const minutes = (await readBody<{ minutes?: unknown }>(event))?.minutes;

  if (minutes !== null && (typeof minutes !== "number" || !Number.isFinite(minutes))) {
    throw fail(400, wording("common.error.bad_action"));
  }

  return deployFlushOf(
    await agencyCall(agency().PATCH("/settings", { body: { deployFlushMinutes: minutes } }), { fields: { deployFlushMinutes: "agents.error.deploy_flush_refused" } })
  );
});
