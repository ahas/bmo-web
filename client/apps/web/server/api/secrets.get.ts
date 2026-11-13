import { listSecrets } from "../utils/account-service";
import { secretFailure, secretSpaceOf } from "../utils/secrets";

import type { SecretList } from "#shared/types";

// The signed-in login's own secrets (docs/web.md, 「Settings」, the secret store section): every name their space
// holds with its size and its time, and never a value. The server holds the user it is handed to the space's own; a
// login that holds no space is answered as if nothing stood there.
export default defineEventHandler(async (event): Promise<SecretList> => {
  const user = secretSpaceOf(await signedInUser(event));

  if (user === null) return { secrets: [] };

  try {
    return { secrets: await listSecrets(user) };
  } catch (error) {
    throw secretFailure(error, "secrets.error.read_failed");
  }
});
