// The agency's answers as its routes give them (the agency's `docs/api.md`): the shapes the agency screens read
// and the bodies they send. They are written here because the console reads the agency over HTTP and imports
// none of its code; a field the agency adds is one the screens do not read until they are written to.

interface SettingBase {
  name: string;
  // Whether the chat template reads it, so the request carries it under `chat_template_kwargs`.
  template?: true;
}

export interface NumberSetting extends SettingBase {
  switch?: undefined;
  min: number;
  // The highest value, or null where the registration's window sets it.
  max: number | null;
  // Whether the lowest value itself is refused, as `top_p` 0 is.
  aboveMin?: boolean;
  // Whether it takes whole numbers only.
  whole?: boolean;
}

// A setting that takes on or off, with no bounds.
export interface SwitchSetting extends SettingBase {
  switch: true;
}

export type GenerationSetting = NumberSetting | SwitchSetting;

export type GenerationValue = number | boolean;

export interface ModelUseView extends ModelUse {
  logTail: string[];
}

export interface CatalogueEntryView extends CatalogueEntry {
  // Whether its engine serves its file now, as the engine's health names it.
  serving: boolean;
}

export interface CatalogueView {
  entries: CatalogueEntryView[];
  uses: ModelUseView[];
}

// The model files the deployment's own engines serve (the agency's docs/model-catalogue.md): each entry a name, a label, the
// file with its size and hash, where it comes from, the engine that serves it and the registration
// that engine is reached by, the nodes it lies on, how a request to it is asked by default, and a
// note; beside them, every time an entry was chosen for its engine.

// How a request to a model is asked where the asker names nothing; each one empty or a value.
export interface GenerationDefaults {
  thinking: boolean | null;
  temperature: number | null;
  topP: number | null;
  presencePenalty: number | null;
  maxTokens: number | null;
}

export interface CatalogueEntry extends GenerationDefaults {
  name: string;
  label: string;
  file: string;
  bytes: number;
  sha256: string;
  // An https address it is fetched from, or the path under the data root of the run that made it.
  source: string | null;
  // The engine that serves it, by its installer's name.
  engine: string | null;
  // The registration that engine is reached by.
  registration: string | null;
  // The nodes the file lies on, by their names in the node list.
  nodes: string[];
  note: string | null;
}

// One time an entry was chosen for its engine, and how it went.
export type ModelUseState = "running" | "done" | "failed";

export interface ModelUse {
  id: number;
  entry: string;
  engine: string;
  chosenBy: string;
  startedAt: number;
  endedAt: number | null;
  state: ModelUseState;
  // Where it stands while running, and why it failed where it did.
  step: string | null;
  reason: string | null;
  // Its log under the data root.
  log: string | null;
}

// One registered model as the agency's model resource serves it (the agency's docs/api.md,
// 「providers, models, pin-checks, tiers and fallback」): its key names the registry's provider and the
// registration apart, `tier` is the first tier the registration is mapped at, and `healthy` says
// whether its addresses answer.

export interface ModelView {
  key: string;
  // The registration's own name, which a supervisor's fixed model holds.
  name?: string;
  provider: string;
  model: string;
  healthy: boolean | null;
  // When the engine last answered a health probe, in unix seconds, where it ever has; absent from a
  // registration answered before the agency kept it.
  lastAnsweredAt?: number | null;
  // The arbiter service its engine is, where it names one, and whether that service's instances keep role files.
  cardService?: string | null;
  roleFiles?: boolean;
  // Every supervisor, role and repository whose order or pin names it, and every model file standing behind it, as
  // the agency names each.
  usedBy?: string[];
  // The registration's own run settings: its window, its answer ceiling and its thinking default.
  contextTokens?: number | null;
  answerTokens?: number | null;
  thinking?: boolean | null;
}

// One of the chat agent's own documents the owner may keep a text of (the agency's `docs/api.md`,
// 「chat-documents」): the text it stands as now, where that text comes from, and when it was last saved.
export interface ChatDocumentView {
  name: string;
  kind: "chat";
  source: "stored" | "file";
  version: number | null;
  text: string;
}

export interface ChatDocumentsView {
  items: ChatDocumentView[];
  more: boolean;
}

// A page of the registered models; the list is not paged, so `more` is false.
export interface ModelPage {
  items: ModelView[];
  more: boolean;
}

