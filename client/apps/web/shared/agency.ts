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

// One session as a holder holds it.
export interface AgentSession {
  agent: string;
  // The room it is one room's, or null.
  chatId: number | null;
  // The holder's kind, which says what a reset of it clears.
  kind: string;
  // What tells this session apart: the room's title and the generation, the models it runs on.
  title: string | null;
  generation: number | null;
  models: string[];
  // Whether a turn or a job of it is known to be running now, which a reset waits for.
  running: boolean;
}

export interface SessionView extends AgentSession {
  label: string;
  icon: string | null;
  waiting: SessionReset | null;
  lastDoneAt: number | null;
}

export interface SessionReset {
  id: number;
  agent: string;
  // The room whose session it is, or null for a session that is no one room's.
  chatId: number | null;
  by: string;
  at: number;
  reason: string;
  // When it was carried out, or null while it waits.
  doneAt: number | null;
}

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
  tier: string | null;
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

export interface CompanionView {
  agent: string;
  label: string;
  icon: string | null;
  // Whether the deployment seeds it, so the console offers no removal: it would stand again at the
  // next start.
  builtin: boolean;
  // The model method it stands on — the supervisor route or a fixed model — and the provider and model
  // it answers on now.
  method?: "route" | "fixed";
  provider?: string | null;
  model?: string | null;
  // The registration it is pinned to, and every registration with an address it may be pinned to.
  registration: string | null;
  registrations: { name: string; label: string }[];
  // The catalogue's entries served behind its registration, and the file its engine serves now.
  entries: Pick<CatalogueEntry, "name" | "label" | "file" | "engine">[];
  serving: string | null;
  // The latest choice of a model for the engine behind its registration.
  modelUse: ModelUseView | null;
  settings: CompanionSettings;
  // Its generation settings with their bounds, `max_tokens` held under its registration's window, and
  // its thinking as its agent row names it, null where its model's default stands.
  generationSettings: GenerationSetting[];
  thinking: boolean | null;
  // The persona its file holds; its system prompt is its base prompt, the fixed companion role and its persona.
  personaFile: string;
  // The base prompt it chooses, by name, and every base prompt it may choose (the agency's docs/base-prompts.md).
  basePrompt: string | null;
  basePrompts: { name: string; label: string }[];
  // The system prompt the next turn sends.
  system: { text: string; characters: number; hash: string };
  // Each room it holds a session in, with a reset of it waiting and when it was last cleared.
  sessions: { chatId: number; title: string | null; generation: number; systemResetAt: number | null; resetWaiting: boolean; lastResetAt: number | null }[];
}

// What an add answers (the agency's docs/companions.md, 「Where a companion and its rooms come from」): every companion as it
// then stands, and the console room the added one answers — its number, whether it was taken back from a removed
// companion of the same name, and the sentence saying so where it was.
export interface CompanionAdded {
  companions: CompanionView[];
  room: { chatId: number; takenBack: boolean; said: string | null };
}

export interface CompanionSettings {
  agent: string;
  // Whether a turn is given its reference — the sheets, memories and gate picks in front of its words.
  referenceOn: boolean;
  // The persona's text, or null for the companion's own file.
  persona: string | null;
  // Its generation settings, each by the name the engine reads it under, with the number or the switch
  // it holds; a setting left out is the engine's own default.
  generation: Record<string, number | boolean>;
  // When and by whom the row was last saved, null where nobody ever saved it.
  updatedAt: number | null;
  updatedBy: string | null;
}

// A companion's reset as bmo-server's route answers it (the agency's docs/companions.md, 「Starting it afresh」):
// what a reset of the ranges asked takes, or took, as the console reads it. The route does the
// work; the console and `bmo companion reset` only ask it and show its answer.

export type CompanionResetRange = "conversation" | "person";

export interface CompanionResetRoom {
  chatId: number;
  title: string | null;
}

export interface CompanionResetAnswer {
  agent: string;
  label: string;
  ranges: CompanionResetRange[];
  // The rooms whose whole record goes, and the rooms where only the companion's own rows go.
  alone: CompanionResetRoom[];
  shared: CompanionResetRoom[];
  rows: { table: string; range: CompanionResetRange; rows: number }[];
  // The files and folders that go, by absolute path.
  files: string[];
  // The copies of the archive that give up rows, or would, each with how many, and those that could
  // not be read or written.
  copies: { path: string; rows: number | null; failure: string | null }[];
  // The person-book writer's runs it stops, by name.
  writerRuns: string[];
  // Only on a reset that ran: what came of the brain's commit, and what could not be removed.
  brain?: "committed" | "nothing" | "failed" | null;
  failures?: string[];
}

export function companionResetTotal(answer: Pick<CompanionResetAnswer, "rows">): number {
  return answer.rows.reduce((sum, one) => sum + one.rows, 0);
}

