import { signedInUser } from "../../utils/accounts";
import { storageFailure, unitStorage } from "../../utils/artifact-storage";
import { unitNumber } from "../../utils/organization";

import type { UnitStorageView } from "#shared/artifact-storage";

// A unit's storage setting (docs/web.md, 「System and organisation」, the storage tab), the unit named by `?unit=`: the kinds of
// place, the unit's own value and what stands for it, and what the reader may change. The unit stands in the query
// rather than the path, since one more route matched by a path's own parameter takes the console's typed routes past
// what the type checker unfolds.
export default defineEventHandler(async (event): Promise<UnitStorageView> => {
  const unit = unitNumber(String(getQuery(event).unit ?? ""));

  try {
    return await unitStorage(unit, await signedInUser(event));
  } catch (error) {
    throw storageFailure(error);
  }
});
