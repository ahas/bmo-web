import { listUnitSecrets } from "../../../../utils/account-service";
import { callerOf, unitNumber } from "../../../../utils/organization";
import { secretFailure } from "../../../../utils/secrets";

import type { SecretList } from "#shared/types";

// The names an organisation unit's secret space holds (docs/web.md, 「System and organisation」, the secrets tab), each with its
// size and its time and never a value. The account service judges who holds the space, the unit's heads and the
// administrator, from the reader handed on in `Owner-Key`.
export default defineEventHandler(async (event): Promise<SecretList> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return { secrets: await listUnitSecrets(unit, callerOf(await signedInUser(event))) };
  } catch (error) {
    throw secretFailure(error, "secrets.error.read_failed");
  }
});
