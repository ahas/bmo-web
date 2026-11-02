import { countText } from "./numbers";

import type { CatalogueEntryView, ModelUseView } from "#shared/agency";
import type { Translate } from "#shared/wording";

// The model catalogue as the model files tab reads and changes it (the agency's docs/model-catalogue.md; docs/web.md,
// 「Agent management screen」).

// A size in bytes as gigabytes with one decimal.
export function sizeText(bytes: number): string {
  return `${(bytes / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
}

// Where the file comes from: a fetch for an address, the run's path for a training's, nothing named.
export function sourceText(t: Translate, source: string | null): string {
  if (source === null) return t("agents.label.source_none");

  return source.startsWith("https://") ? t("agents.label.source_fetch") : source;
}

const dash = "—";

// An entry's defaults, each named with its value, a dash where the entry sets none.
export function defaultsPairs(t: Translate, entry: Pick<CatalogueEntryView, "thinking" | "temperature" | "topP" | "presencePenalty" | "maxTokens">): { name: string; value: string }[] {
  return [
    { name: t("agents.label.thinking"), value: entry.thinking === null ? dash : t(entry.thinking ? "agents.label.think_on" : "agents.label.think_off") },
    { name: "temperature", value: entry.temperature === null ? dash : String(entry.temperature) },
    { name: "top_p", value: entry.topP === null ? dash : String(entry.topP) },
    { name: "presence_penalty", value: entry.presencePenalty === null ? dash : String(entry.presencePenalty) },
    { name: "max_tokens", value: entry.maxTokens === null ? dash : countText(entry.maxTokens) }
  ];
}

// A choice of an entry for its engine as one line: the entry, the engine, who and how it went.
export function useText(t: Translate, use: Pick<ModelUseView, "entry" | "engine" | "chosenBy" | "state" | "step" | "reason">): string {
  const state = use.state === "running"
    ? t("agents.status.use_running", { step: use.step ?? t("agents.status.use_starting") })
    : use.state === "done" ? t("agents.status.use_done") : t("agents.status.use_failed", { reason: use.reason ?? "" });

  return `${use.engine} ← ${use.entry} · ${use.chosenBy} · ${state}`;
}

// One entry as the box edits it.
// The generation settings an entry records, each with what a number field takes.
export const GENERATION_FIELDS = [
  { field: "temperature", label: "temperature", min: 0, max: 2, step: 0.05 },
  { field: "topP", label: "top_p", min: 0.01, max: 1, step: 0.01 },
  { field: "presencePenalty", label: "presence_penalty", min: -2, max: 2, step: 0.1 },
  { field: "maxTokens", label: "max_tokens", min: 1, max: 1_048_576, step: 1 },
] as const;

export interface CatalogueForm {
  name: string;
  label: string;
  file: string;
  bytes: number | null;
  sha256: string;
  source: string;
  engine: string;
  registration: string;
  note: string;
  // On or off, or empty where the entry leaves it to the engine.
  thinking: "" | "on" | "off";
  temperature: number | null;
  topP: number | null;
  presencePenalty: number | null;
  maxTokens: number | null;
}

export function emptyCatalogueForm(): CatalogueForm {
  return { name: "", label: "", file: "", bytes: null, sha256: "", source: "", engine: "", registration: "", note: "", thinking: "", temperature: null, topP: null, presencePenalty: null, maxTokens: null };
}

export function catalogueForm(entry: CatalogueEntryView): CatalogueForm {
  return {
    name: entry.name,
    label: entry.label,
    file: entry.file,
    bytes: entry.bytes,
    sha256: entry.sha256,
    source: entry.source ?? "",
    engine: entry.engine ?? "",
    registration: entry.registration ?? "",
    note: entry.note ?? "",
    thinking: entry.thinking === null ? "" : entry.thinking ? "on" : "off",
    temperature: entry.temperature,
    topP: entry.topP,
    presencePenalty: entry.presencePenalty,
    maxTokens: entry.maxTokens,
  };
}

// What a save of the box asks of the bot: every field, an empty text an empty field.
export function catalogueSave(form: CatalogueForm): Record<string, unknown> {
  const text = (value: string): string | null => (value.trim() === "" ? null : value.trim());

  return {
    action: "save",
    name: form.name.trim(),
    label: form.label.trim() === "" ? form.name.trim() : form.label.trim(),
    file: form.file.trim(),
    bytes: form.bytes,
    sha256: form.sha256.trim().toLowerCase(),
    source: text(form.source),
    engine: text(form.engine),
    registration: text(form.registration),
    note: text(form.note),
    thinking: form.thinking === "" ? null : form.thinking === "on",
    temperature: form.temperature,
    topP: form.topP,
    presencePenalty: form.presencePenalty,
    maxTokens: form.maxTokens,
  };
}

// Where in the box a refusal stands: the field the bot named, or the box as a whole.
export function catalogueRefusalPlace(field: string | null | undefined): string {
  const places = ["name", "label", "file", "bytes", "sha256", "source", "engine", "registration", "note", "thinking", "temperature", "topP", "presencePenalty", "maxTokens"];

  return places.find((one) => one === field) ?? "form";
}

// Whether any choice is running, which the section reads again for while it lasts.
export function anyRunning(uses: readonly Pick<ModelUseView, "state">[]): boolean {
  return uses.some((one) => one.state === "running");
}
