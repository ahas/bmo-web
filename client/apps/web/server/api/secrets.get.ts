import { listSecrets } from "../utils/account-service";
import { ownerRoleOf } from "../utils/owner-key";
import { secretFailure } from "../utils/secrets";

import type { SecretList } from "#shared/types";

// The secret store's list (docs/web.md, 「Organisation settings」, the secret store tab): every name the store holds
// with its size and its time, and never a value. It is the administrator's, and the server holds the role it is
// handed to that too.
export default defineEventHandler(async (event): Promise<SecretList> => {
  const signed = await requireAdministrator(event);

  try {
    return { secrets: await listSecrets(ownerRoleOf(signed)) };
  } catch (error) {
    throw secretFailure(error, "secrets.error.read_failed");
  }
});
