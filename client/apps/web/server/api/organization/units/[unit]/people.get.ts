import { unitNumber } from "../../../../utils/organization";
import { unitPeople } from "../../../../utils/unit-people";

import type { UnitPerson } from "#shared/unit-people";

// The people standing in a unit or under it, for the permissions tab (docs/web.md, 「Organisation」, the permissions
// tab): a head of the unit and the administrator are answered, anyone else refused by the account service.
export default defineEventHandler(async (event): Promise<UnitPerson[]> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  return await unitPeople(unit, await signedInUser(event));
});
