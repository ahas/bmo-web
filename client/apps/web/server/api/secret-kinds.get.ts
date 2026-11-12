import { listSecretKinds } from "../utils/account-service";
import { ownerRoleOf } from "../utils/owner-key";
import { secretFailure } from "../utils/secrets";

import type { SecretKindList } from "#shared/secret-kinds";

// The secret kinds (docs/web.md, the secret store section): the shapes the secret form asks a value in, the administrator's
// as the store is.
export default defineEventHandler(async (event): Promise<SecretKindList> => {
  const signed = await requireAdministrator(event);

  try {
    return { kinds: await listSecretKinds(ownerRoleOf(signed)) };
  } catch (error) {
    throw secretFailure(error, "secrets.error.kinds_read_failed");
  }
});
