import { wording } from "#shared/wording";

import { organizationFailure } from "../../../../utils/organization";
import { unitRemovalPreview } from "../../../../utils/removal";

import type { UnitRemovalView } from "#shared/removal";

// What deleting a unit and every unit under it for good would take now, unit by unit, with the people standing in it
// and nothing changed: the platform administrator's alone (docs/web.md, the organisation screen's permanent delete).
export default defineEventHandler(async (event): Promise<UnitRemovalView> => {
  const signed = await requireAdministrator(event);
  const unit = Number(getRouterParam(event, "unit"));

  if (!Number.isSafeInteger(unit) || unit <= 0) throw fail(400, wording("organization.error.bad_request"));

  let preview: Awaited<ReturnType<typeof unitRemovalPreview>>;

  try {
    preview = await unitRemovalPreview(unit, { administrator: String(signed.id ?? "") });
  } catch (error) {
    throw organizationFailure(error);
  }

  if (preview === null) throw fail(404, wording("organization.error.not_found"));

  const { plan, units } = preview;

  return {
    unit: plan.unit,
    name: plan.name,
    company: plan.company,
    units: plan.units,
    people: plan.people,
    refusal: plan.refusal ?? null,
    counted: units
  };
});
