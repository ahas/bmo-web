import { putSecretKind } from "../../utils/account-service";
import { ownerRoleOf } from "../../utils/owner-key";
import { kindOfBody, secretFailure } from "../../utils/secrets";

import type { SecretKind } from "#shared/secret-kinds";

// A secret kind changed whole (docs/web.md, the secret store section). A kind's key does not change, so the path's names it.
export default defineEventHandler(async (event): Promise<SecretKind> => {
  const signed = await requireAdministrator(event);
  const key = getRouterParam(event, "key", { decode: true }) ?? "";
  const kind = { ...kindOfBody(await readBody<unknown>(event)), key };

  try {
    return await putSecretKind(kind, ownerRoleOf(signed));
  } catch (error) {
    throw secretFailure(error, "secrets.error.kind_save_failed");
  }
});
