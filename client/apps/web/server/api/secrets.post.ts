import { keepSecret } from "../utils/account-service";
import { ownerRoleOf } from "../utils/owner-key";
import { secretFailure } from "../utils/secrets";

import { SECRET_NAME_MAX, secretNameIsPlain } from "#shared/secrets";
import { wording } from "#shared/wording";

import type { KeptSecret } from "#shared/types";

interface SecretBody {
  name?: unknown;
  value?: unknown;
  replace?: unknown;
}

// A secret written under a name (docs/web.md, 「Settings」, the secret store section). The name travels in the body
// with the value, never in the address, so nothing typed into the form stands in an address a proxy logs. The
// answer is what the server answered, the name, the size and the time; the value goes to the server and nowhere
// else, and nothing here logs the body.
export default defineEventHandler(async (event): Promise<KeptSecret> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<SecretBody>(event);
  const name = typeof body?.name === "string" ? body.name : "";

  if (!secretNameIsPlain(name)) throw fail(400, wording("secrets.error.bad_name", { max: SECRET_NAME_MAX }));

  if (typeof body?.value !== "string" || body.value === "") throw fail(400, wording("secrets.error.empty_value"));

  try {
    return await keepSecret(name, body.value, body.replace === true, ownerRoleOf(signed));
  } catch (error) {
    throw secretFailure(error, "secrets.error.save_failed");
  }
});
