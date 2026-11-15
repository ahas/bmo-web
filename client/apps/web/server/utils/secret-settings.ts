import { SECRET_SETTINGS } from "#shared/secret-settings";

import type { SecretSettingsView } from "#shared/secret-settings";

// The secret settings as the agency's `GET /settings` answers them (its `docs/api.md`, 「settings」). The published
// agency client names none of their fields, so each is read off the answer by its field: a secret's name, or null
// for none and for anything that is not a name.
export function secretSettingsOf(settings: object): SecretSettingsView {
  return Object.fromEntries(
    SECRET_SETTINGS.map(({ field }) => {
      const held: unknown = Reflect.get(settings, field);

      return [field, typeof held === "string" && held !== "" ? held : null];
    })
  );
}
