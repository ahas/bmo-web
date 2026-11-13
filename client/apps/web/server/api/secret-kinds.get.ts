import { listSecretKinds } from "../utils/account-service";
import { secretFailure } from "../utils/secrets";

import type { SecretKindList } from "#shared/secret-kinds";

// The secret kinds (docs/web.md, 「Organisation settings」, its kinds tab): the shapes every person's secret form asks
// a value in, the deployment's, so any signed-in login reads them.
export default defineEventHandler(async (event): Promise<SecretKindList> => {
  await signedInUser(event);

  try {
    return { kinds: await listSecretKinds() };
  } catch (error) {
    throw secretFailure(error, "secrets.error.kinds_read_failed");
  }
});
