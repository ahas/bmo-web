// The agency's settings that name a secret of the platform administrator's space (docs/web.md, 「Administration」,
// the providers tab; the agency's `docs/api.md`, 「settings」): each by the field the agency keeps it under, the kind
// its secret is saved in, and the pack's key for its label. A setting of the same shape is one more entry here and
// its label in the pack.

export const SECRET_SETTINGS = [
  { field: "deepseekCardSecret", kind: "card", label: "agents.label.deepseek_card_secret" },
  { field: "deepseekLoginSecret", kind: "account-login", label: "agents.label.deepseek_login_secret" }
] as const;

export type SecretSetting = (typeof SECRET_SETTINGS)[number];
export type SecretSettingField = SecretSetting["field"];

/** Each setting's secret by its field: a secret's name, or null for none; a field the answer lacks reads as none. */
export type SecretSettingsView = Partial<Record<SecretSettingField, string | null>>;

/** A change of one setting: its field, and the secret's name or null for none. */
export interface SecretSettingAsk {
  field: SecretSettingField;
  secret: string | null;
}

export function secretSettingNamed(field: unknown): SecretSetting | undefined {
  return SECRET_SETTINGS.find((setting) => setting.field === field);
}
