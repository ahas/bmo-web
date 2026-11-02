import { formatStamp } from "bmo-ui/app/domain/time";

import type { ModelView } from "#shared/agency";
import type { Translate } from "#shared/wording";

// The registered models as the screen reads and changes them (the agency's docs/api.md, 「providers,
// models and model files」). The model resource is one registration: its key names the registry's provider and the
// registration apart, the model behind it, its card service, whether its engine answers and what names it.

// A registration's own name, the part of its key after the provider.
export function registrationName(key: string): string {
  const at = key.indexOf("::");

  return at === -1 ? key : key.slice(at + 2);
}

// The provider every registration is held under.
const REGISTRY_PROVIDER = "registered";

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

// One registration as the box edits it: its name, fixed once made, the model behind it, its card service, empty for
// none, and whether that service keeps role files.
export interface ModelForm {
  name: string;
  model: string;
  cardService: string;
  roleFiles: boolean;
}

export function emptyModelForm(): ModelForm {
  return { name: "", model: "", cardService: "", roleFiles: false };
}

export function modelForm(model: ModelView): ModelForm {
  return { name: registrationName(model.key), model: model.model, cardService: model.cardService ?? "", roleFiles: model.roleFiles === true };
}

// What a new registration asks of the agency: the key its name makes, the model behind it and its card service.
export function modelCreate(form: ModelForm): { key: string; model: string; cardService: string | null; roleFiles: boolean } {
  return { key: registrationKey(form.name.trim()), model: form.model.trim(), cardService: form.cardService.trim() === "" ? null : form.cardService.trim(), roleFiles: form.roleFiles };
}

// What a change asks: everything but its name, which is fixed once made; an emptied card service is none.
export function modelChange(form: ModelForm): { model: string; cardService: string; roleFiles: boolean } {
  return { model: form.model.trim(), cardService: form.cardService.trim(), roleFiles: form.roleFiles };
}

// Where in the box a refusal stands: the field the agency named, or the box as a whole.
export function modelRefusalPlace(field: string | null | undefined): "name" | "model" | "key" | "cardService" | "roleFiles" | "form" {
  const places = ["name", "model", "key", "cardService", "roleFiles"] as const;

  return places.find((one) => one === field) ?? "form";
}

// The kinds the agency names a registration's users by, each with the pack's word.
const USER_KINDS: Readonly<Record<string, string>> = {
  supervisor: "agents.label.used_by_supervisor",
  role: "agents.label.used_by_role",
  repository: "agents.label.used_by_repository"
};

/** One name of what uses a registration, as the agency answers it — `<kind> <name>` — in the pack's words; any other is
 * the agency's own. */
export function usedByText(t: Translate, used: string): string {
  const at = used.indexOf(" ");
  const key = at === -1 ? undefined : USER_KINDS[used.slice(0, at)];

  return key === undefined ? used : t(key, { name: used.slice(at + 1) });
}

