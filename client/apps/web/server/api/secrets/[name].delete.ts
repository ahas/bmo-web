import { dropSecret } from "../../utils/account-service";
import { ownerRoleOf } from "../../utils/owner-key";
import { secretFailure } from "../../utils/secrets";

import { SECRET_NAME_MAX, secretNameIsPlain } from "#shared/secrets";
import { wording } from "#shared/wording";

// A secret taken out of the list (docs/web.md, 「Settings」, the secret store section): the server moves its file
// aside to `<name>.previous`. The name is one the list showed, so it may stand in the address.
export default defineEventHandler(async (event): Promise<{ name: string }> => {
  const signed = await requireAdministrator(event);
  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!secretNameIsPlain(name)) throw fail(400, wording("secrets.error.bad_name", { max: SECRET_NAME_MAX }));

  try {
    await dropSecret(name, ownerRoleOf(signed));
  } catch (error) {
    throw secretFailure(error, "secrets.error.delete_failed");
  }

  return { name };
});
