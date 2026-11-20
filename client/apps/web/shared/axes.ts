import type { GenerationSetting } from "./agency";

// The agency's two axes and its places as the agent management screen reads them (the agency's `docs/agents.md`,
// 「Two axes」; its `docs/api.md`, 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and
// 「providers, models and model files」): the supervisors, the roles, the repositories, the providers a road names
// and the models a provider holds. The console reads the agency over HTTP and imports none of its code, so the shapes
// a screen reads are written here; a field the agency's published types leave untyped is read as its `docs/api.md`
// states it, and one the answer does not carry stands as none (docs/boundary.md, 「Gaps the console meets」).

// One road: a provider and what runs on it there — the model, the effort level or none for the provider's own, `on`,
// `off` or none for the thinking, on the registry's provider the answer ceiling or none, and on a provider that takes
// one the advisor the model consults, a family word or a model id, or none.
export interface RoadView {
  provider: string;
  model: string;
  effort: string | null;
  thinking: string | null;
  answerTokens: number | null;
  advisor: string | null;
}

// One provider the agency carries: its name, the pack's word for its code, the owner's switch, the lines its program
// carries, why it cannot answer now in the pack's words with the agency's own sentence beside, and
// the compaction threshold a row whose road stands on it is given where it sets none.
export interface ProviderView {
  name: string;
  label: string;
  enabled: boolean;
  registered: boolean;
  lines: string[];
  reason: string | null;
  reasonEnglish: string | null;
  foldRatioDefault: number | null;
  // The file under the data root's env/ the provider reads its own key from, or null for one that reads none.
  keyFile: string | null;
  // Whether its engine is the owner's own, as the provider declares it (the agency's `docs/supervisors.md`, 「What
  // confines a session allowed files」). A provider whose engine is not sends what a session reads to an outside party.
  ownersEngine: boolean;
  // Whether a road on it may name an advisor, and the family words it names one by beside a model of its own, as the
  // provider declares them; none where it takes none.
  takesAdvisor: boolean;
  advisorWords: string[];
}

// One model a road may name on a provider: its id, the effort levels a road on it takes (none listed is every
// level the harness declares), whether the catalogue serves its generation or has superseded it, and what its
// registration or road member declares — its thinking default and its answer ceiling, none where it declares none.
export interface ProviderModelView {
  id: string;
  efforts: string[];
  inService: boolean | null;
  thinking: boolean | null;
  answerTokens: number | null;
}

// The models a provider holds, with the moment a stale read was taken in epoch milliseconds, or null for a fresh one.
export interface ProviderModelsView {
  provider: string;
  models: ProviderModelView[];
  staleReadAt: number | null;
}

// One supervisor as its row holds it (the agency's `docs/supervisors.md`).
export interface SupervisorView {
  name: string;
  // The label it is shown by, its name where it keeps none.
  label: string;
  // The account whose BMO it is: the one the agency files it under, else the user its name `u<user>` names, else none,
  // the administrator's (docs/accounts.md, 「Whose BMO a supervisor is」).
  ownerAccount: number | null;
  // Whether its program runs as the owner's own user on this machine: the agency files it under no account or under
  // the owner's account (the agency's `docs/supervisors.md`, 「What confines a session allowed files」).
  runsAsOwner: boolean;
  icon: string | null;
  aliases: string | null;
  sessionScope: string;
  turnShape: string;
  defaultAnswerer: boolean;
  // Whether the deployment seeds it or it is the default answerer, either of which the agency never removes.
  seeded: boolean;
  repository: string | null;
  // The one road every turn of it goes out on; none where its row names no road.
  road: RoadView | null;
  warming: Record<string, boolean>;
  foldRatio: number;
}

// One bundle a role may give, by its name and the words the screen says it in.
export interface RoleBundleView {
  name: string;
  label: string;
}

export type RoleSessions = "keep" | "fresh";

// One role as its row holds it and what stands of it now (the agency's `docs/agent-roles.md`).
export interface RoleView {
  // Its key, which every screen shows it by alone; its label is the English word the agency's log keeps.
  name: string;
  label: string;
  description: string | null;
  prompt: string | null;
  // The text a run of the role carries after its prompt, by the provider its program stands on; a provider it names
  // none for is absent.
  providerPrompts: Record<string, string>;
  bundles: RoleBundleView[];
  // The skills its runs carry; null where it names none and its runs carry the whole plugin the agency's release
  // places for it.
  skills: string[] | null;
  line: string;
  // Its agents, in the order a run looks for a free one (the agency's `docs/role-agents.md`): each a seat of the
  // role on one road.
  agents: RoleAgentView[];
  // The roads its runs go out on, read off its agents that are switched on, each once.
  roads: RoadView[];
  // How many of its agents are switched on: the most of its runs that go at once.
  maxConcurrent: number;
  running: number;
  waiting: number;
  // The provider its next run goes out on; none where none of its agents' roads can answer now.
  provider: string | null;
  waitingFor: string | null;
}

// One agent of a role (the agency's `docs/role-agents.md`, 「What an agent row holds」): its road, a provider and a
// model or neither, whether it is switched on, its place among its role's, and what it lays over its role's preset,
// each null where the role's own stands.
export interface RoleAgentView {
  name: string;
  role: string;
  provider: string | null;
  model: string | null;
  effort: string | null;
  thinking: string | null;
  answerTokens: number | null;
  // The advisor its model consults; none where it names none, and always none where it names no road and follows the
  // asking supervisor's.
  advisor: string | null;
  enabled: boolean;
  keepsCache: boolean;
  // Whether its runs keep their sessions.
  sessions: RoleSessions;
  // Its compaction threshold; null where the ratio its provider declares stands.
  foldRatio: number | null;
  prompt: string | null;
  bundles: string[] | null;
  skills: string[] | null;
  // Whether it names no road, so its runs follow the supervisor that asks them.
  followsSupervisor: boolean;
  // Whether a run stands let in on it now.
  carries: boolean;
}

// Every role in the agency's order, every bundle a role may give, every skill a role or an agent may name and every
// line a role may name.
export interface RolesView {
  roles: RoleView[];
  bundles: RoleBundleView[];
  skills: string[];
  lines: string[];
}

// One session a role's runs opened (the agency's `docs/sessions.md`, 「The session history of a role」): moments in
// epoch milliseconds, and the context its last answered turn carried as tokens and a share of the window.
export interface RoleSessionView {
  id: number;
  path: string;
  provider: string;
  model: string;
  effort: string | null;
  account: string | null;
  openedAt: number;
  lastAnsweredAt: number | null;
  runs: number;
  contextTokens: number | null;
  contextShare: number | null;
  valid: boolean;
}

export interface RoleSessionPage {
  items: RoleSessionView[];
  more: boolean;
}

// One checkout of a repository: its name, path and node, its kind — `base`, `support` or `node` — and the job holding
// it, where one does.
export interface CheckoutView {
  name: string;
  path: string;
  nodeName: string | null;
  kind: string;
  job: { jobId: number | null; itemId: number | null; role: string | null } | null;
}

// How many support checkouts a repository keeps beside its base (the agency's `docs/repositories.md`): `auto`, a
// checkout grown whenever a launch finds every one held, or that many fixed, none at 0.
export type SupportCount = "auto" | number;

// One repository as its row holds it, with its checkouts (the agency's `docs/repositories.md`).
export interface RepositoryView {
  name: string;
  label: string;
  ownLabel: string | null;
  icon: string | null;
  path: string;
  nodeName: string | null;
  supportCount: SupportCount;
  // A folder holding other repositories' checkouts, whose own tree its jobs never write; it takes no support and no
  // node checkouts.
  umbrella: boolean;
  prefixDocuments: string[];
  preamble: string | null;
  rules: string | null;
  devCommand: string | null;
  pin: { provider: string; model: string } | null;
  downgradeHeal: boolean;
  // The sampling a run on a pinned registration is sent, each setting by the name the engine reads it under, and every
  // setting it may hold with its bounds.
  sampling: Record<string, number | boolean>;
  samplingSettings: GenerationSetting[];
  checkouts: CheckoutView[];
}

// One checkout on a work node as a repository's change sends it: the node, and the path from the node's home or
// absolute, or none for the agency's own place or, on one already standing, the path it keeps.
export interface NodeCheckoutAsk {
  nodeName: string;
  path: string | null;
}

// One node the agency places jobs on (the agency's `docs/work-nodes.md`, 「Which nodes take jobs」): its name, its label
// and how it is reached, in the pack's words.
export interface WorkNodeView {
  name: string;
  label: string;
  kind: string;
}

// The settings a supervisor whose turns its settings' pieces make holds of its own: its generation settings with their
// bounds and the values it holds, its reference switch, its persona — null where it keeps none and its file's text
// stands — the system prompt its next turn sends, and how many room sessions a change of its generation starts afresh.
export interface SupervisorSettingsView {
  name: string;
  sessions: number;
  generation: Record<string, number | boolean>;
  generationSettings: GenerationSetting[];
  referenceOn: boolean;
  persona: string | null;
  personaFile: string;
  system: { text: string; characters: number; hash: string };
}

// A supervisor the console added: its name, the console room it answers alone, and whether that room is one already
// standing under the title that the add took back.
export interface SupervisorAddedView {
  name: string;
  roomId: number;
  takenBack: boolean;
}

// The supervisor that answers every room naming none, as the receiver's setting holds it.
export interface DefaultAnswererView {
  supervisor: string;
}

// The supervisor a search or browse run no supervisor delegated writes its brain for, as the agency's own settings hold
// it, or none.
export interface ResearchSupervisorView {
  supervisor: string | null;
}

// One room a supervisor's turns went into (the agency's `docs/api.md`, 「supervisors」): how many of its runs went there
// and its latest, the run a screen opens its log at, moments in epoch milliseconds.
export interface SupervisorRoomView {
  chatId: number;
  runs: number;
  lastRun: string;
  lastStartedAt: number;
  lastFinishedAt: number | null;
}

// Whether a supervisor's road can take a turn now (the agency's `docs/api.md`, 「supervisors」), and the agency's
// sentence for why where it cannot.
export interface SupervisorRoadStateView {
  answers: boolean;
  reason: string | null;
}
