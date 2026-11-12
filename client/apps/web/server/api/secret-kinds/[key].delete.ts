import { dropSecretKind } from "../../utils/account-service";
import { ownerRoleOf } from "../../utils/owner-key";
import { secretFailure } from "../../utils/secrets";

// A secret kind removed (docs/web.md, the secret store section); no secret stored is touched.
export default defineEventHandler(async (event): Promise<{ key: string }> => {
  const signed = await requireAdministrator(event);
  const key = getRouterParam(event, "key", { decode: true }) ?? "";

  try {
    await dropSecretKind(key, ownerRoleOf(signed));
  } catch (error) {
    throw secretFailure(error, "secrets.error.kind_delete_failed");
  }

  return { key };
});
