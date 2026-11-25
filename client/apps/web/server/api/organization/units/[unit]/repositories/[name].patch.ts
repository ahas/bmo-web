import { wording } from "#shared/wording";

import { orgAgentsFailure } from "../../../../../utils/organisation-supply";
import { unitNumber } from "../../../../../utils/organization";
import { changeUnitRepository } from "../../../../../utils/unit-repositories";

import type { RepositoryView } from "#shared/axes";

// A unit's repository changed in the reader's name, the fields its dialog sends (docs/web.md, 「System and organisation」, the
// agents tab); the agency judges whether they head the unit.
export default defineEventHandler(async (event): Promise<RepositoryView> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const name = axisName(getRouterParam(event, "name"));
  const change = repositoryChangeOf(await readBody<unknown>(event), false);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  try {
    return await changeUnitRepository(event, unit, name, change, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
