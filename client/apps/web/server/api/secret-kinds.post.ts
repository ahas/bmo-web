import { addSecretKind } from "../utils/account-service";
import { ownerRoleOf } from "../utils/owner-key";
import { kindOfBody, secretFailure } from "../utils/secrets";

import type { SecretKind } from "#shared/secret-kinds";

// A secret kind added (docs/web.md, the secret store section); the server holds it to the kind's rules and answers it as kept.
export default defineEventHandler(async (event): Promise<SecretKind> => {
  const signed = await requireAdministrator(event);
  const kind = kindOfBody(await readBody<unknown>(event));

  try {
    return await addSecretKind(kind, ownerRoleOf(signed));
  } catch (error) {
    throw secretFailure(error, "secrets.error.kind_save_failed");
  }
});
