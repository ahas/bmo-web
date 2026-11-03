import type { GenerationSetting } from "#shared/agency";
import type { SupervisorSettingsView } from "#shared/axes";
import type { Translate } from "#shared/wording";

// Generation settings as a settings form reads and changes them — a supervisor's own and a repository's sampling
// (docs/web.md, 「Agent management screen」).

// What each generation setting is for, in a few words the form shows beside it. A setting the agency names that this
// list does not is shown by its name alone.
const GENERATION_USES: Readonly<Record<string, string>> = {
  temperature: "agents.label.use_temperature",
  top_p: "agents.label.use_top_p",
  top_k: "agents.label.use_top_k",
  min_p: "agents.label.use_min_p",
  presence_penalty: "agents.label.use_presence_penalty",
  frequency_penalty: "agents.label.use_frequency_penalty",
  repeat_penalty: "agents.label.use_repeat_penalty",
  repeat_last_n: "agents.label.use_repeat_last_n",
  dry_multiplier: "agents.label.use_dry_multiplier",
  dry_base: "agents.label.use_dry_base",
  dry_allowed_length: "agents.label.use_dry_allowed_length",
  seed: "agents.label.use_seed",
  max_tokens: "agents.label.use_max_tokens",
  preserve_thinking: "agents.label.use_preserve_thinking",
};

export function generationUse(t: Translate, name: string): string {
  const key = GENERATION_USES[name];

  return key === undefined ? "" : t(key);
}

// A setting's bounds as its box shows them beside it; a switch has none.
export function generationBounds(setting: GenerationSetting): string {
  if (setting.switch === true) return "";

  const number = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: 3 });

  return setting.max === null ? `${number(setting.min)} ~` : `${number(setting.min)} ~ ${number(setting.max)}`;
}

// The boxes as they start: each setting's saved number as text, and a switch's saved choice as on or off; a box or a
// choice the engine's own default stands in stays empty, since no route says what that default is
// (docs/web.md, 「The default among choices」).
export function generationDraft(view: Pick<SupervisorSettingsView, "generationSettings" | "generation">): Record<string, string> {
  return settingsDraft(view.generationSettings, view.generation);
}

// The same for any list of these settings and the values held of them, as a repository's sampling is shown (the
// agency's docs/repositories.md, 「A pinned model」).
export function settingsDraft(settings: readonly GenerationSetting[], values: Readonly<Record<string, number | boolean>>): Record<string, string> {
  return Object.fromEntries(settings.map((one) => {
    const value = values[one.name];

    return [one.name, value === undefined ? "" : typeof value === "boolean" ? (value ? "on" : "off") : String(value)];
  }));
}

// What a box or a choice holds, as a save sends it: null where it stands empty, a switch's on or off, and anything
// else as the number it reads as, which the agency checks.
function generationValueOf(text: string | number | null | undefined): number | boolean | null {
  // A number box may hand back a number rather than its text.
  const typed = String(text ?? "").trim();

  if (typed === "") return null;
  if (typed === "on" || typed === "off") return typed === "on";

  return Number(typed);
}

// What a save sends of the boxes: each one that differs from what is saved, an emptied one as null.
export function generationChange(draft: Readonly<Record<string, string | number | null | undefined>>, saved: Readonly<Record<string, number | boolean>>): Record<string, number | boolean | null> {
  return Object.fromEntries(Object.entries(draft).flatMap(([name, text]): [string, number | boolean | null][] => {
    const value = generationValueOf(text);
    const held = saved[name];

    if (value === null) return held === undefined ? [] : [[name, null]];

    return value === held ? [] : [[name, value]];
  }));
}

// Everything a supervisor's own settings let the owner change, as the form's fields hold it until the form saves
// (docs/web.md, 「Forms」). The persona is null where the supervisor keeps none of its own and its file's text is shown.
export interface PiecesDraft {
  generation: Record<string, string>;
  referenceOn: boolean;
  persona: string | null;
}

// The fields as the agency holds them now.
export function piecesDraft(view: SupervisorSettingsView): PiecesDraft {
  return { generation: generationDraft(view), referenceOn: view.referenceOn, persona: view.persona };
}

// Whether a field differs from what is saved.
export function draftDiffers(key: keyof PiecesDraft, draft: PiecesDraft, saved: PiecesDraft): boolean {
  if (key === "generation") return Object.keys(generationChange(draft.generation, savedGeneration(saved.generation))).length > 0;

  return JSON.stringify(draft[key]) !== JSON.stringify(saved[key]);
}

function savedGeneration(boxes: Readonly<Record<string, string>>): Record<string, number | boolean> {
  return Object.fromEntries(Object.entries(boxes).flatMap(([name, text]): [string, number | boolean][] => {
    const value = generationValueOf(text);

    return value === null ? [] : [[name, value]];
  }));
}

// What one save of a supervisor's own settings sends: every field that differs, which the agency checks whole.
export function piecesChange(draft: PiecesDraft, saved: PiecesDraft): Record<string, unknown> {
  const differs = (key: keyof PiecesDraft): boolean => draftDiffers(key, draft, saved);

  return {
    ...(differs("referenceOn") ? { referenceOn: draft.referenceOn } : {}),
    ...(differs("persona") ? { persona: draft.persona } : {}),
    ...(differs("generation") ? { generation: generationChange(draft.generation, savedGeneration(saved.generation)) } : {})
  };
}
