import type { GenerationSetting } from "./agency";

// The agency's two axes and its places as the agent management screen reads them (the agency's `docs/agents.md`,
// 「Two axes」; its `docs/api.md`, 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and
// 「providers, models and model files」): the supervisors, the roles, the repositories, the providers an order names
// and the models a provider holds. The console reads the agency over HTTP and imports none of its code, so the shapes
// a screen reads are written here; a field the agency's published types leave untyped is read as its `docs/api.md`
// states it, and one the answer does not carry stands as none (docs/boundary.md, 「Gaps the console meets」).

// One provider of an order and what the row runs on there: the model, the effort level or none for the provider's
// own, `on`, `off` or none for the thinking, and on the registry's provider the answer ceiling or none.
export interface OrderEntryView {
  provider: string;
  model: string;
  effort: string | null;
  thinking: string | null;
  answerTokens: number | null;
}

// What a provider has left as the order reads it (the agency's `docs/provider-order.md`, 「Quota: what a provider has
// left」): the share left, the window that counted, a balance for one that keeps one, and when the window resets.
export interface QuotaView {
  left: number | null;
  window: string | null;
  balance: number | null;
  resetsAt: number | null;
}

// One provider the agency carries: its name, the pack's word for its code, the owner's switch, the lines its program
// carries, what it has left, why it cannot answer now in the pack's words with the agency's own sentence beside, and
// the compaction threshold a row whose order begins on it is given where its add names none.
export interface ProviderView {
  name: string;
  label: string;
  enabled: boolean;
  registered: boolean;
  lines: string[];
  quota: QuotaView | null;
  reason: string | null;
  reasonEnglish: string | null;
  foldRatioDefault: number | null;
}

// One model an order's entry may name on a provider: its id, the effort levels its entry takes (none listed is every
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

// One supervisor as its row holds it and what it stands on now (the agency's `docs/supervisors.md`).
export interface SupervisorView {
  name: string;
  // The label it is shown by, its name where it keeps none.
  label: string;
  icon: string | null;
  aliases: string | null;
  sessionScope: string;
  turnShape: string;
  defaultAnswerer: boolean;
  // Whether the deployment seeds it or it is the default answerer, either of which the agency never removes.
  seeded: boolean;
  repository: string | null;
  order: OrderEntryView[];
  quotaShare: number;
  warming: Record<string, boolean>;
  foldRatio: number;
  // What its last turn went out on, and why its turn waits where no provider of its order has quota.
  provider: string | null;
  model: string | null;
  effort: string | null;
  waitingFor: string | null;
}

// One bundle a role may give, by its name and the words the screen says it in.
export interface RoleBundleView {
  name: string;
  label: string;
}

export type RoleSessions = "keep" | "fresh";

// One role as its row holds it and what stands of it now (the agency's `docs/agent-roles.md`).
export interface RoleView {
  name: string;
  // What the screen names it by, as every screen names a role.
  shown: string;
  label: string;
  description: string | null;
  prompt: string | null;
  bundles: RoleBundleView[];
  line: string;
  order: OrderEntryView[];
  quotaShare: number;
  maxConcurrent: number;
  sessions: RoleSessions;
  foldRatio: number;
  callable: boolean;
  running: number;
  waiting: number;
  provider: string | null;
  waitingFor: string | null;
}

// Every role in the agency's order, every bundle a role may give and every line a role may name.
export interface RolesView {
  roles: RoleView[];
  bundles: RoleBundleView[];
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

// One repository as its row holds it, with its checkouts (the agency's `docs/repositories.md`).
export interface RepositoryView {
  name: string;
  label: string;
  ownLabel: string | null;
  icon: string | null;
  path: string;
  nodeName: string | null;
  supportCount: number;
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

// One room a supervisor's turns went into (the agency's `docs/api.md`, 「supervisors」): how many of its runs went there
// and its latest, the run a screen opens its log at, moments in epoch milliseconds.
export interface SupervisorRoomView {
  chatId: number;
  runs: number;
  lastRun: string;
  lastStartedAt: number;
  lastFinishedAt: number | null;
}

// The stand-in answering for a supervisor now, by the pack's word for its provider and the model, or none.
export interface StandInView {
  provider: string;
  model: string;
}
