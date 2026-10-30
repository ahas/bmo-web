// The agency's answers as its routes give them (the agency's `docs/api.md`): the shapes the agency screens read
// and the bodies they send. They are written here because the console reads the agency over HTTP and imports
// none of its code; a field the agency adds is one the screens do not read until they are written to.

import type { AgentProviderName, StopTarget } from "./types";

export type TierProvider = AgentProviderName;

export interface ModelCapability { provider: TierProvider; model: string; efforts: readonly (string | null)[] }

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

export type ModelTier = string;
export type CoworkerTier = string;

// A provider as the tier screen heads its column: its own label, whether its mapping carries an answer
// ceiling, the efforts it takes and whether it is on.
export interface TierProviderView {
  provider: TierProvider;
  label: string;
  capsAnswerTokens: boolean;
  efforts: (string | null)[];
  enabled: boolean;
}

export interface TierChoice {
  model: string;
  effort: string | null;
}

// The registry's mapping also names the ceiling of the answer's tokens; null is the work's own default.
export interface TierMapping extends TierChoice {
  provider: TierProvider;
  tier: ModelTier;
  answerTokens?: number | null;
}

export interface TierConflict {
  key: string;
  provider: TierProvider;
  previous: TierChoice;
  accepted: boolean;
}

// One work key's tier, the tiers it may take, and what it resolves to on each provider or why it does not.
export interface TierAssignmentView {
  key: string;
  tier: ModelTier;
  choices: ModelTier[];
  // Why the key does not resolve on a provider, in the pack's words, with the agency's own sentence beside it.
  effective: { provider: TierProvider; selection: TierMapping | null; error: string | null; errorEnglish: string | null }[];
}

// The tiers, their mappings on each provider and every work key's assignment (the agency's docs/model-tiers.md).
export interface TierSettingsView {
  tiers: ModelTier[];
  providers: TierProviderView[];
  mappings: TierMapping[];
  conflicts: TierConflict[];
  assignments: TierAssignmentView[];
}

// Where a fold ratio comes from: set on the console, the provider's own default where none is set, or the
// general default where the provider declares none either.
export type FoldRatioSource = "set" | "provider" | "default";

// One provider's fold ratio at one tier: the share of a model's window a session may fill before it is folded
// once the turn that crossed it is over.
export interface FoldRatioView {
  provider: TierProvider;
  tier: ModelTier;
  ratio: number;
  source: FoldRatioSource;
}

// The fold-ratio grid (the agency's `docs/api.md`, 「fold-ratios」): the tiers in ladder order, the providers
// the agency declares, and every provider's ratio at every tier.
export interface FoldRatiosView {
  tiers: ModelTier[];
  providers: TierProvider[];
  ratios: FoldRatioView[];
}

// What one model of a provider's catalogue offers a screen beyond the capability a save is checked
// against. Each fact is the provider's to answer and absent from one that does not: `free` from
// OpenRouter, and from a provider whose catalogue tells a generation in service from a superseded
// one, `inService` — with `staleReadAt` saying, where the whole list served was read past that
// provider's own freshness mark, when that read was taken.
export interface TierCatalogueEntry extends ModelCapability { free?: boolean; inService?: boolean; staleReadAt?: number }

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

// The live picture of the common co-worker pool the console's live status screen draws as tiles
// (docs/web.md, 「Live status screen」): a tile for every place a tier has on a provider that is
// turned on and lends co-workers, and one for every worker's own turn, as the agency reads it on every ask.

// Where one tile's work can be read while it runs: an agent's log, at the place one run of it begins.
export interface PoolBoardLog {
  agent: string;
  run: string;
}

// What holds a place. `kind` names who asked for it, which is all the screen needs to pick a mark.
export interface PoolBoardWork {
  kind: "cowork" | "search" | "browse" | "native" | "turn" | "other";
  role: string;
  // The tier as the pool holds it.
  tier: string;
  provider: TierProvider;
  model: string;
  effort: string | null;
  // The item or run it serves, and the step of it, in the words the rest of the console uses.
  title: string;
  detail: string | null;
  todoId: number | null;
  since: number | null;
  log: PoolBoardLog | null;
  // What a stop of this tile names. A co-worker has no reach of its own — no unit, no envelope, no
  // cancel file — so what a tile is stopped by is the run it works inside, which is the same run
  // its log belongs to (`the agency's docs/agent-control.md` 「Stopping」). A place held for work that has not
  // started names nothing.
  stop: StopTarget | null;
}

export interface PoolBoardTile {
  // Working: a child runs in it. Held: a reservation keeps it for an owner. Idle: nobody is in it.
  state: "working" | "held" | "idle";
  work: PoolBoardWork | null;
}

export interface PoolBoardBucket {
  provider: TierProvider;
  tier: CoworkerTier;
  capacity: number;
  tiles: PoolBoardTile[];
  waiting: PoolBoardWork[];
}

// One job worker: its turns are bounded by its checkout, so it has exactly one place, which an
// ordinary job of its fills as well as a co-work turn.
export interface PoolBoardWorker {
  name: string;
  label: string;
  tile: PoolBoardTile;
  waiting: PoolBoardWork[];
}

export interface PoolBoard {
  readAt: number;
  buckets: PoolBoardBucket[];
  workers: PoolBoardWorker[];
}

// One place's limit as the agency's `PATCH /pool/limits` takes and answers it.
export interface PoolLimitView {
  provider: TierProvider;
  tier: CoworkerTier;
  capacity: number;
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

export interface BasePromptView extends BasePrompt {
  characters: number;
  // The agents that choose it, with their labels.
  choosers: { agent: string; label: string }[];
}

export interface BasePromptsView {
  prompts: BasePromptView[];
  // Every agent's choice that names one, by agent.
  choices: Record<string, string>;
  // The value names a prompt may carry.
  values: string[];
}

export interface BasePrompt {
  name: string;
  label: string;
  text: string;
  // When and by whom it was last saved, null for a seed nobody has saved since.
  updatedAt: number | null;
  updatedBy: string | null;
}

export interface AgentSamplingView {
  agent: string;
  // The settings a worker samples with, with their bounds.
  settings: readonly GenerationSetting[];
  // What it holds of them; a setting left out is the engine's own default.
  values: Record<string, GenerationValue>;
}

// The settings every research run is held to and the search engines' state, as the agency answers them (the agency's
// `docs/api.md`, 「research」; docs/web.md, the searcher tab).
export interface ResearchKeySettings {
  key: string;
  branches: number;
  minutes: number;
}

export interface SearchEngineState {
  name: string;
  category: string | null;
  state: string;
  reason: string | null;
  observedAt: number | null;
  suspendedUntil: number | null;
}

export interface ResearchSettingsView {
  branchRole: string;
  strategy: string;
  hostIntervalMs: number | null;
  engineIntervalMs: number | null;
  keys: ResearchKeySettings[];
  source: string;
  engines: SearchEngineState[] | null;
  enginesUnread: string | null;
  // The co-worker roles a search's branches may go out on.
  roles: string[];
}

// One change to the research settings: the field named alone, every other kept.
export type ResearchSettingsChange =
  | { branchRole: string }
  | { strategy: string }
  | { hostIntervalMs: number | null }
  | { engineIntervalMs: number | null }
  | { keys: ResearchKeySettings[] };

// A bundle a role gives, by the name the agency takes it under and the words the screen says it in.
export interface AgentRoleBundleView {
  name: string;
  label: string;
}

// One role as the agency holds it (the agency's `docs/agent-roles.md`): `shown` is what the screen names it by,
// `label` the label the agency keeps, which the role's dialog edits.
export interface AgentRoleView {
  name: string;
  shown: string;
  label: string;
  bundles: AgentRoleBundleView[];
  // How many of its agents' turns may run at once; none is no bound.
  maxConcurrent: number | null;
  prompt: string | null;
  tier: ModelTier | null;
  // How many agents hold it, and whether it is the role a kind is registered with where none is chosen.
  agents: number;
  kindDefault: boolean;
}

// Every role in the agency's order, and every bundle a role may give.
export interface AgentRolesView {
  roles: AgentRoleView[];
  bundles: AgentRoleBundleView[];
}

// What a role's dialog sends: every field on a new role, the changed ones on a role being edited, a cleared
// bound, prompt or tier as null.
export interface AgentRoleChange {
  name?: string;
  label?: string;
  bundles?: string[];
  maxConcurrent?: number | null;
  prompt?: string | null;
  tier?: ModelTier | null;
}
