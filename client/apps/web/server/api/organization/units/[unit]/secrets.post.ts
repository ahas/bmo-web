import { writeUnitSecret } from "../../../../utils/account-service";
import { callerOf, unitNumber } from "../../../../utils/organization";
import { secretFailure } from "../../../../utils/secrets";

import { SECRET_NAME_MAX, secretNameIsPlain } from "#shared/secrets";
import { wording } from "#shared/wording";

import type { KeptSecret } from "#shared/types";

interface SecretBody {
  name?: unknown;
  value?: unknown;
  replace?: unknown;
  encoding?: unknown;
}

// A secret written under a name in an organisation unit's space (docs/web.md, 「Organisation」, the secrets tab), as the
// reader's own secrets are written: the name travels in the body with the value, never in the address, the answer is
// the name, the size and the time, and nothing here logs the body.
export default defineEventHandler(async (event): Promise<KeptSecret> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const signed = await signedInUser(event);
  const body = await readBody<SecretBody>(event);
  const name = typeof body?.name === "string" ? body.name : "";

  if (!secretNameIsPlain(name)) throw fail(400, wording("secrets.error.bad_name", { max: SECRET_NAME_MAX }));

  if (typeof body?.value !== "string" || body.value === "") throw fail(400, wording("secrets.error.empty_value"));

  try {
    const encoding = body.encoding === "base64" ? "base64" : "text";

    return await writeUnitSecret(unit, name, { value: body.value, encoding }, body.replace === true, callerOf(signed));
  } catch (error) {
    throw secretFailure(error, "secrets.error.save_failed");
  }
});
