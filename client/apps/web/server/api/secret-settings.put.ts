import { secretSettingsOf } from "../utils/secret-settings";
import { secretSettingNamed } from "#shared/secret-settings";
import { secretNameIsPlain } from "#shared/secrets";
import { wording } from "#shared/wording";

import type { SecretSettingsView } from "#shared/secret-settings";

// One secret setting chosen (the agency's `docs/api.md`, 「settings」): its field, and a secret's name or null for
// none. The answer is every setting as the agency then holds it; the agency's refusal of the name is said by the
// sentence for a refused value, naming the field.
export default defineEventHandler(async (event): Promise<SecretSettingsView> => {
  await requireAdministrator(event);

  const body = await readBody<{ field?: unknown; secret?: unknown }>(event);
  const setting = secretSettingNamed(body?.field);
  const secret = body?.secret;

  if (setting === undefined || (secret !== null && (typeof secret !== "string" || !secretNameIsPlain(secret)))) {
    throw fail(400, wording("common.error.bad_action"));
  }

  const ask: Record<string, string | null> = { [setting.field]: secret };

  return secretSettingsOf(await agencyCall(agency().PATCH("/settings", { body: ask })));
});
