import { formatStamp } from "bmo-ui/app/domain/time";

import type { ModelView } from "#shared/agency";
import type { Translate } from "#shared/wording";

// The registered models as the screen reads and changes them (the agency's docs/api.md, 「providers,
// models, pin-checks, tiers and fallback」). The model resource is one registration: its key names the
// registry's provider and the registration apart, the model behind it, the first tier it is mapped at
// and whether its addresses answer.

// The provider every registration is chosen under, where a worker is pinned to one.
export const REGISTRY_PROVIDER = "registered";

// A registration's own name, the part of its key after the provider.
export function registrationName(key: string): string {
  const at = key.indexOf("::");

  return at === -1 ? key : key.slice(at + 2);
}

// The key the registry's provider names a registration by.
export function registrationKey(name: string): string {
  return `${REGISTRY_PROVIDER}::${name}`;
}

// What a row says of a registration: whether its addresses answer, or nothing where that is not known. One
// that does not answer now says when it last did, where it ever has.
export function healthText(t: Translate, healthy: boolean | null, lastAnsweredAt: number | null = null): string {
  if (healthy === null) return "";
  if (healthy) return t("agents.label.registry_healthy");

  return lastAnsweredAt === null ? t("agents.label.registry_unhealthy") : t("agents.label.registry_last_answered", { time: formatStamp(lastAnsweredAt) });
}

export function healthMark(healthy: boolean | null): { icon: string; tone: string } | null {
  return healthy === null
    ? null
    : healthy
      ? { icon: "i-material-symbols-check-circle-outline", tone: "text-success" }
      : { icon: "i-material-symbols-error-outline", tone: "text-error" };
}

// One registration as the box edits it: its name, fixed once made, and the model behind it.
export interface ModelForm {
  name: string;
  model: string;
}

export function emptyModelForm(): ModelForm {
  return { name: "", model: "" };
}

export function modelForm(model: ModelView): ModelForm {
  return { name: registrationName(model.key), model: model.model };
}

// What a new registration asks of the bot: the key its name makes, and the model behind it.
export function modelCreate(form: ModelForm): { key: string; model: string } {
  return { key: registrationKey(form.name.trim()), model: form.model.trim() };
}

// What a change asks: the model behind the registration alone, since its name is fixed once made.
export function modelChange(form: ModelForm): { model: string } {
  return { model: form.model.trim() };
}

// Where in the box a refusal stands: the field the bot named, or the box as a whole.
export function modelRefusalPlace(field: string | null | undefined): "name" | "model" | "key" | "form" {
  const places = ["name", "model", "key"] as const;

  return places.find((one) => one === field) ?? "form";
}

// The registrations a worker or a companion may be pinned to: those whose addresses answer.
export function answeringModels(models: readonly ModelView[]): ModelView[] {
  return models.filter((one) => one.healthy === true);
}

// The registrations a worker may be pinned to, each a pin naming the registry's provider and the
// registration apart.
export function registryPinChoices(models: readonly ModelView[]): { label: string; value: string }[] {
  return answeringModels(models).map((one) => ({ label: registrationName(one.key), value: one.key }));
}

// A worker's pin as the dialog holds it: the provider, or the provider and the registration it names.
export function pinValue(provider: string | null | undefined, model: string | null | undefined, auto: string): string {
  if (provider === null || provider === undefined) return auto;

  return model === null || model === undefined ? provider : `${provider}::${model}`;
}
