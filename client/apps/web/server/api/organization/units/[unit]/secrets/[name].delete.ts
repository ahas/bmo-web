import { dropUnitSecret } from "../../../../../utils/account-service";
import { callerOf, unitNumber } from "../../../../../utils/organization";
import { secretFailure } from "../../../../../utils/secrets";

import { SECRET_NAME_MAX, secretNameIsPlain } from "#shared/secrets";
import { wording } from "#shared/wording";

// A secret taken out of an organisation unit's space (docs/web.md, 「System and organisation」, the secrets tab): the server moves
// its file aside to `<name>.previous`. The name is one the list showed, so it may stand in the address.
export default defineEventHandler(async (event): Promise<{ name: string }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!secretNameIsPlain(name)) throw fail(400, wording("secrets.error.bad_name", { max: SECRET_NAME_MAX }));

  try {
    await dropUnitSecret(unit, name, callerOf(await signedInUser(event)));
  } catch (error) {
    throw secretFailure(error, "secrets.error.delete_failed");
  }

  return { name };
});
