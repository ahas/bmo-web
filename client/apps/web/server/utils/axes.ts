import { wording } from "#shared/wording";

import { agency, agencyCall } from "./agency";
import { defaultAnswerer } from "./owner";
import { bundleWordOf, providerLabelOf, roadReasonOf } from "./agency-words";

import type { Provider, Repository, Role, Supervisor } from "@agency/client";
import type { components } from "@agency/client/schema";
import type { GenerationSetting } from "#shared/agency";
import type { ActiveProviderView, CheckoutView, NodeCheckoutAsk, OrderEntryView, ProviderModelsView, ProviderModelView, ProviderView, QuotaView, RepositoryView, RoleAgentView, RoleBundleView, RoleSessionPage, RoleSessionView, RolesView, RoleView, StandInView, SupervisorRoomView, SupervisorView, WorkNodeView } from "#shared/axes";

type Schemas = components["schemas"];

// The agency's two axes and its places, read and changed through its routes (the agency's `docs/api.md`,
// 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and 「providers, models and model files」),
// in the shapes the agent management screen reads. A field the published types leave untyped is read as the agency's
// document states it, defensively: a field that does not read as its shape stands as none.

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const record = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** One order's entries as the screen reads them; a member that does not read as an entry is left out. */
export function orderOf(entries: unknown): OrderEntryView[] {
  return list(entries).flatMap((one): OrderEntryView[] => {
    const held = record(one);
    const provider = text(held.provider);
    const model = text(held.model);

    if (provider === null || model === null) return [];

    return [{ provider, model, effort: text(held.effort), thinking: text(held.thinking), answerTokens: number(held.answerTokens) }];
  });
}

/** One order's entries as the agency takes them, each field as the screen holds it. */
export function orderBody(entries: readonly OrderEntryView[]): Schemas["OrderEntry"][] {
  return entries.map((one) => ({ provider: one.provider, model: one.model, effort: one.effort, thinking: one.thinking, answerTokens: one.answerTokens }));
}

/** An order a screen sent, read off its body: each entry of its own shape, or null where any is not. */
export function orderAsked(value: unknown): OrderEntryView[] | null {
  if (!Array.isArray(value)) return null;

  const entries = orderOf(value);

  return entries.length === value.length ? entries : null;
}

function quotaOf(value: unknown): QuotaView | null {
  if (value === null || typeof value !== "object") return null;

  const held = record(value);
  const balance = held.balance;

  return {
    left: number(held.left),
    window: text(held.window),
    balance: number(balance) ?? number(record(balance).amount),
    resetsAt: number(held.resetsAt)
  };
}

/** A forced active provider as the agency answers it, or none where it names none or not in its shape. */
export function activeOf(value: unknown): ActiveProviderView | null {
  const held = record(value);
  const provider = text(held.provider);
  const model = text(held.model);

  return provider === null || model === null ? null : { provider, model };
}

/** A forced active provider a screen sent: a provider and a model, or null to clear it; undefined where it is
 * neither. */
export function activeAsked(value: unknown): ActiveProviderView | null | undefined {
  if (value === null) return null;

  const asked = activeOf(value);

  return asked === null ? undefined : asked;
}

/** One provider as the screen reads it: the pack's word for its code, its switch, its lines, its quota and its reason. */
export function providerViewOf(provider: Provider): ProviderView {
  const held = record(provider);
  const said = roadReasonOf(held.reason, held.reasonCode);

  return {
    name: provider.name,
    label: providerLabelOf(provider.code, provider.name),
    enabled: provider.enabled,
    registered: provider.registered,
    lines: list(held.lines).filter((one): one is string => typeof one === "string"),
    quota: quotaOf(held.quota),
    reason: said.reason,
    reasonEnglish: said.reasonEnglish,
    foldRatioDefault: number(held.foldRatioDefault)
  };
}

/** Every provider the agency carries, in its order. */
export async function readProviders(): Promise<ProviderView[]> {
  const page = await agencyCall(agency().GET("/providers"));

  return page.items.map(providerViewOf);
}

/** The owner's switch thrown on one provider; the last one on is refused by the agency. */
export async function switchProvider(name: string, enabled: boolean): Promise<ProviderView> {
  return providerViewOf(await agencyCall(agency().PATCH("/providers/{providerName}", { params: { path: { providerName: name } }, body: { enabled } })));
}

function providerModelOf(value: unknown): ProviderModelView[] {
  const held = record(value);
  const id = text(held.id);

  if (id === null) return [];

  return [{
    id,
    efforts: list(held.efforts).filter((one): one is string => typeof one === "string"),
    inService: typeof held.inService === "boolean" ? held.inService : null,
    thinking: typeof held.thinking === "boolean" ? held.thinking : null,
    answerTokens: number(held.answerTokens)
  }];
}

/** The models an order's entry may name on one provider; a catalogue that cannot be read answers the agency's refusal. */
export async function readProviderModels(name: string): Promise<ProviderModelsView> {
  const answer = await agencyCall(agency().GET("/provider-models/{providerName}", { params: { path: { providerName: name } } }));

  return { provider: answer.provider, models: answer.models.flatMap(providerModelOf), staleReadAt: number(answer.staleReadAt) };
}

/** One supervisor as the screen reads it, marked as the default answerer where the receiver's setting names it. */
export function supervisorViewOf(supervisor: Supervisor, answerer: string | null): SupervisorView {
  const warming: Record<string, boolean> = {};

  for (const [provider, on] of Object.entries(record(supervisor.warming))) {
    if (typeof on === "boolean") warming[provider] = on;
  }

  return {
    name: supervisor.name,
    label: supervisor.label ?? supervisor.name,
    ownerAccount: supervisor.ownerAccount ?? null,
    icon: supervisor.icon,
    aliases: supervisor.aliases,
    sessionScope: supervisor.sessionScope,
    turnShape: supervisor.turnShape,
    defaultAnswerer: supervisor.name === answerer,
    seeded: supervisor.seeded,
    repository: supervisor.repository,
    order: orderOf(supervisor.order),
    quotaShare: supervisor.quotaShare,
    active: activeOf(supervisor.active),
    warming,
    foldRatio: supervisor.foldRatio,
    provider: supervisor.provider,
    model: supervisor.model,
    effort: supervisor.effort,
    waitingFor: supervisor.waitingFor
  };
}

export async function readSupervisors(): Promise<SupervisorView[]> {
  const [page, answerer] = await Promise.all([agencyCall(agency().GET("/supervisors")), defaultAnswerer()]);

  return page.items.map((supervisor) => supervisorViewOf(supervisor, answerer));
}

export async function readSupervisor(name: string): Promise<SupervisorView> {
  const [supervisor, answerer] = await Promise.all([agencyCall(agency().GET("/supervisors/{supervisorName}", { params: { path: { supervisorName: name } } })), defaultAnswerer()]);

  return supervisorViewOf(supervisor, answerer);
}

/**
 * Whether the agency registers `name` and the login account `account` owns it (the agency's
 * `docs/agent-ownership.md`): a group room names only its creator's supervisor, and none another person's.
 */
export async function supervisorOwnedBy(name: string, account: number | null): Promise<boolean> {
  if (account === null) return false;

  const page = await agencyCall(agency().GET("/supervisors"));

  return page.items.some((supervisor) => supervisor.name === name && supervisor.ownerAccount === account);
}

/** A supervisor's change as a screen sent it, each field of its own shape; null where the body names none. */
export function supervisorChangeOf(body: unknown): Schemas["SupervisorChange"] | null {
  const held = record(body);
  const change: Schemas["SupervisorChange"] = {};

  if (typeof held.label === "string" && held.label.trim() !== "") change.label = held.label.trim();
  if ("order" in held) {
    const order = orderAsked(held.order);

    if (order === null) return null;

    change.order = orderBody(order);
  }
  if (typeof held.quotaShare === "number") change.quotaShare = held.quotaShare;
  if ("active" in held) {
    const active = activeAsked(held.active);

    if (active === undefined) return null;

    change.active = active;
  }
  if (typeof held.foldRatio === "number") change.foldRatio = held.foldRatio;
  if ("repository" in held) change.repository = text(held.repository);
  if ("warming" in held) {
    const warming: Record<string, boolean> = {};

    for (const [provider, on] of Object.entries(record(held.warming))) {
      if (typeof on !== "boolean") return null;

      warming[provider] = on;
    }

    change.warming = warming;
  }

  return Object.keys(change).length === 0 ? null : change;
}

export async function changeSupervisor(name: string, change: Schemas["SupervisorChange"]): Promise<SupervisorView> {
  const [supervisor, answerer] = await Promise.all([agencyCall(agency().PATCH("/supervisors/{supervisorName}", { params: { path: { supervisorName: name } }, body: change })), defaultAnswerer()]);

  return supervisorViewOf(supervisor, answerer);
}

// A bundle is worded by its code, the name with each dot a hyphen (the agency's `docs/api.md`, 「roles」).
function bundleOf(bundle: Schemas["RoleBundle"]): RoleBundleView {
  return { name: bundle.name, label: bundleWordOf(bundle.code, bundle.name, bundle.label) };
}

/** One agent of a role as the screen reads it (docs/web.md, the roles tab). */
export function roleAgentViewOf(agent: Schemas["RoleAgent"]): RoleAgentView {
  return {
    name: agent.name,
    role: agent.role,
    provider: agent.provider ?? null,
    model: agent.model ?? null,
    effort: agent.effort ?? null,
    thinking: agent.thinking ?? null,
    answerTokens: agent.answerTokens ?? null,
    enabled: agent.enabled,
    position: agent.position,
    keepsCache: agent.keepsCache,
    foldRatio: agent.foldRatio ?? null,
    prompt: agent.prompt ?? null,
    bundles: agent.bundles ?? null,
    skills: agent.skills ?? null,
    followsSupervisor: agent.followsSupervisor ?? (agent.provider == null),
    carries: agent.carries ?? false
  };
}

/** The roads a role's runs go out on: its agents that are switched on and name one, each road once, in their order. */
export function roadsOf(agents: readonly Schemas["RoleAgent"][]): OrderEntryView[] {
  const roads: OrderEntryView[] = [];

  for (const agent of agents) {
    if (!agent.enabled || agent.provider == null || agent.model == null) continue;
    if (roads.some((road) => road.provider === agent.provider && road.model === agent.model)) continue;

    roads.push({ provider: agent.provider, model: agent.model, effort: agent.effort ?? null, thinking: agent.thinking ?? null, answerTokens: agent.answerTokens ?? null });
  }

  return roads;
}

/** One role as the screen reads it, named by its name on every screen (docs/web.md, the roles tab). */
export function roleViewOf(role: Role): RoleView {
  return {
    name: role.name,
    label: role.label,
    description: role.description,
    prompt: role.prompt,
    bundles: role.bundles.map(bundleOf),
    line: role.line,
    agents: (role.agents ?? []).map(roleAgentViewOf),
    order: roadsOf(role.agents ?? []),
    maxConcurrent: role.maxConcurrent,
    sessions: role.sessions,
    foldRatio: role.foldRatio,
    callable: role.callable,
    running: role.running,
    waiting: role.waiting,
    provider: role.provider,
    waitingFor: role.waitingFor
  };
}

export async function readRoles(): Promise<RolesView> {
  const answer = await agencyCall(agency().GET("/roles"));

  return { roles: answer.roles.map(roleViewOf), bundles: answer.bundles.map(bundleOf), lines: answer.lines };
}

const SESSIONS = ["keep", "fresh"] as const;
const wholeFrom = (value: unknown, least: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= least;

/**
 * A role's change as a screen sent it, every field checked for its shape and nothing else: a new role needs its name,
 * its label, its bundles and its line; a change any one field. An emptied prompt or description is a cleared one. Null
 * where the body does not read as one; whether the values stand is the agency's to say.
 */
export function roleChangeOf(body: unknown, adding: boolean): (Schemas["RoleChange"] & { name?: string }) | null {
  const held = record(body);
  const change: Schemas["RoleChange"] & { name?: string } = {};

  if (adding) {
    if (text(held.name) === null) return null;

    change.name = (held.name as string).trim();
  }

  if ("label" in held) {
    if (text(held.label) === null) return null;

    change.label = (held.label as string).trim();
  }

  if ("bundles" in held) {
    if (!Array.isArray(held.bundles) || !held.bundles.every((one) => text(one) !== null)) return null;

    change.bundles = held.bundles as string[];
  }

  if ("line" in held) {
    if (text(held.line) === null) return null;

    change.line = held.line as string;
  }

  if ("sessions" in held) {
    if (!SESSIONS.includes(held.sessions as (typeof SESSIONS)[number])) return null;

    change.sessions = held.sessions as (typeof SESSIONS)[number];
  }

  if ("foldRatio" in held) {
    if (typeof held.foldRatio !== "number") return null;

    change.foldRatio = held.foldRatio;
  }

  if ("callable" in held) {
    if (typeof held.callable !== "boolean") return null;

    change.callable = held.callable;
  }

  for (const field of ["prompt", "description"] as const) {
    if (!(field in held)) continue;
    if (held[field] !== null && typeof held[field] !== "string") return null;

    change[field] = text(typeof held[field] === "string" ? (held[field] as string).trim() : null) === null ? null : (held[field] as string);
  }

  if (adding && (change.label === undefined || change.bundles === undefined || change.line === undefined)) return null;
  if (!adding && Object.keys(change).length === 0) return null;

  return change;
}

/** A new role; on a new role the agency is sent no prompt or description it was not given. */
export async function addRole(change: Schemas["RoleChange"] & { name?: string }): Promise<RoleView> {
  const { name, label, bundles, line } = change;

  if (name === undefined || label == null || bundles == null || line == null) throw fail(400, wording("common.error.bad_action"));

  const body: Schemas["RoleAsk"] = { name, label, bundles, line };

  if (change.prompt != null) body.prompt = change.prompt;
  if (change.description != null) body.description = change.description;
  if (change.sessions != null) body.sessions = change.sessions;
  if (change.foldRatio != null) body.foldRatio = change.foldRatio;
  if (change.callable != null) body.callable = change.callable;

  return roleViewOf(await agencyCall(agency().POST("/roles", { body })));
}

export async function changeRole(name: string, change: Schemas["RoleChange"] & { name?: string }): Promise<RoleView> {
  const { name: _name, ...body } = change;

  return roleViewOf(await agencyCall(agency().PATCH("/roles/{roleName}", { params: { path: { roleName: name } }, body })));
}

// A role still going or waiting, or one the policy names as a default, is not removed.
const ROLE_REMOVAL_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.role_delete_refused" };

export async function removeRole(name: string): Promise<void> {
  await agencyCall(agency().DELETE("/roles/{roleName}", { params: { path: { roleName: name } } }), { codes: ROLE_REMOVAL_CODES });
}

// The fields of an agent a screen may send, each with the shape it takes; null clears a field that may be cleared.
const AGENT_TEXTS = ["provider", "model", "effort", "thinking", "prompt"] as const;
const AGENT_LISTS = ["bundles", "skills"] as const;

/**
 * An agent's change as a screen sent it, every field checked for its shape and nothing else: a new agent needs its
 * role; a change any one field. Null where the body does not read as one; whether the values stand is the agency's to
 * say.
 */
export function roleAgentChangeOf(body: unknown, adding: boolean): (Schemas["RoleAgentChange"] & { role?: string; name?: string }) | null {
  const held = record(body);
  const change: Schemas["RoleAgentChange"] & { role?: string; name?: string } = {};

  if (adding) {
    if (text(held.role) === null) return null;

    change.role = (held.role as string).trim();

    if ("name" in held && held.name !== null) {
      if (text(held.name) === null) return null;

      change.name = (held.name as string).trim();
    }
  }

  for (const field of AGENT_TEXTS) {
    if (!(field in held)) continue;
    if (held[field] !== null && typeof held[field] !== "string") return null;

    const written = typeof held[field] === "string" ? (held[field] as string).trim() : "";

    change[field] = written === "" ? null : written;
  }

  for (const field of AGENT_LISTS) {
    if (!(field in held)) continue;
    if (held[field] !== null && !(Array.isArray(held[field]) && (held[field] as unknown[]).every((one) => text(one) !== null))) return null;

    change[field] = held[field] as string[] | null;
  }

  for (const field of ["enabled", "keepsCache"] as const) {
    if (!(field in held)) continue;
    if (typeof held[field] !== "boolean") return null;

    change[field] = held[field] as boolean;
  }

  if ("position" in held) {
    if (!wholeFrom(held.position, 0)) return null;

    change.position = held.position;
  }

  if ("answerTokens" in held) {
    if (held.answerTokens !== null && !wholeFrom(held.answerTokens, 1)) return null;

    change.answerTokens = held.answerTokens as number | null;
  }

  if ("foldRatio" in held) {
    if (held.foldRatio !== null && typeof held.foldRatio !== "number") return null;

    change.foldRatio = held.foldRatio as number | null;
  }

  if (!adding && Object.keys(change).length === 0) return null;

  return change;
}

// An agent that carries a run is not removed, and a name already taken is not given again.
const AGENT_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.role_agent_refused" };

export async function addRoleAgent(change: Schemas["RoleAgentChange"] & { role?: string; name?: string }): Promise<RoleAgentView> {
  const { role, ...fields } = change;

  if (role === undefined) throw fail(400, wording("common.error.bad_action"));

  return roleAgentViewOf(await agencyCall(agency().POST("/role-agents", { body: { role, ...fields } }), { codes: AGENT_CODES }));
}

export async function changeRoleAgent(name: string, change: Schemas["RoleAgentChange"] & { role?: string; name?: string }): Promise<RoleAgentView> {
  const { role: _role, name: _name, ...body } = change;

  return roleAgentViewOf(await agencyCall(agency().PATCH("/role-agents/{agentName}", { params: { path: { agentName: name } }, body })));
}

export async function removeRoleAgent(name: string): Promise<void> {
  await agencyCall(agency().DELETE("/role-agents/{agentName}", { params: { path: { agentName: name } } }), { codes: AGENT_CODES });
}

function roleSessionOf(session: Schemas["RoleSession"]): RoleSessionView {
  const context = record(session.context);

  return {
    id: session.id,
    path: session.path,
    provider: session.provider,
    model: session.model,
    effort: session.effort,
    account: session.account,
    openedAt: session.openedAt,
    lastAnsweredAt: session.lastAnsweredAt,
    runs: session.runs,
    contextTokens: number(context.tokens),
    contextShare: number(context.share),
    valid: session.valid
  };
}

/** One page of a role's session history, newest first, the page before the session `before` names. */
export async function readRoleSessions(name: string, before: number | null, limit: number): Promise<RoleSessionPage> {
  const query = before === null ? { limit } : { before, limit };
  const page = await agencyCall(agency().GET("/roles/{roleName}/sessions", { params: { path: { roleName: name }, query } }));

  return { items: page.items.map(roleSessionOf), more: page.more };
}

function checkoutOf(value: unknown): CheckoutView[] {
  const held = record(value);
  const path = text(held.path);

  if (path === null) return [];

  // The job holding it, as the agency answers it: an object of its own, or its fields on the checkout itself.
  const job = held.job === undefined ? held : held.job;
  const holding = record(job);
  const jobId = number(holding.jobId);
  const itemId = number(holding.itemId);
  const role = text(holding.role);

  return [{
    name: text(held.name) ?? path,
    path,
    nodeName: text(held.nodeName),
    kind: text(held.kind) ?? "base",
    job: job === null || (jobId === null && itemId === null && role === null) ? null : { jobId, itemId, role }
  }];
}

function samplingOf(value: unknown): Record<string, number | boolean> {
  const values: Record<string, number | boolean> = {};

  for (const [name, held] of Object.entries(record(value))) {
    if (typeof held === "number" || typeof held === "boolean") values[name] = held;
  }

  return values;
}

// A sampling change as a screen sent it: each setting a number, a switch, or none to give it back to the engine; null
// where any is none of these.
function samplingAsked(value: unknown): Record<string, number | boolean | null> | null {
  const values: Record<string, number | boolean | null> = {};

  for (const [name, held] of Object.entries(record(value))) {
    if (held !== null && typeof held !== "boolean" && (typeof held !== "number" || !Number.isFinite(held))) return null;

    values[name] = held;
  }

  return values;
}

// Every setting a repository's sampling may hold, by its name and bounds, as the agency answers them; one that does not
// read as a setting is left out.
function samplingSettingsOf(value: unknown): GenerationSetting[] {
  return list(value).flatMap((one): GenerationSetting[] => {
    const held = record(one);
    const name = text(held.name);

    if (name === null) return [];
    if (held.switch === true) return [{ name, switch: true }];

    return [{
      name,
      min: number(held.min) ?? 0,
      max: number(held.max),
      ...(held.aboveMin === true ? { aboveMin: true } : {}),
      ...(held.whole === true ? { whole: true } : {})
    }];
  });
}

// A node checkouts list as a screen sent it, whole: each a node and a path or none; null where any is not.
function nodeCheckoutsAsked(value: unknown): NodeCheckoutAsk[] | null {
  if (!Array.isArray(value)) return null;

  const asked = value.map((one): NodeCheckoutAsk | null => {
    const held = record(one);
    const nodeName = text(held.nodeName);

    return nodeName === null || (held.path !== null && held.path !== undefined && typeof held.path !== "string") ? null : { nodeName, path: text(held.path) };
  });

  return asked.every((one) => one !== null) ? (asked as NodeCheckoutAsk[]) : null;
}

/** One repository as the screen reads it. */
export function repositoryViewOf(repository: Repository): RepositoryView {
  return {
    name: repository.name,
    label: repository.label ?? repository.name,
    ownLabel: repository.label,
    icon: repository.icon,
    path: repository.path,
    nodeName: repository.nodeName,
    supportCount: repository.supportCount,
    prefixDocuments: repository.prefixDocuments,
    preamble: repository.preamble,
    rules: repository.rules,
    devCommand: repository.devCommand,
    pin: repository.pin,
    downgradeHeal: repository.downgradeHeal,
    sampling: samplingOf(repository.sampling),
    samplingSettings: samplingSettingsOf(repository.samplingSettings),
    checkouts: repository.checkouts.flatMap(checkoutOf)
  };
}

export async function readRepositories(): Promise<RepositoryView[]> {
  const page = await agencyCall(agency().GET("/repositories"));

  return page.items.map(repositoryViewOf);
}

/** A repository's fields as a screen sent them, each of its own shape; null where any is not. */
export function repositoryChangeOf(body: unknown, adding: boolean): Schemas["RepositoryAsk"] | null {
  const held = record(body);
  const change: Schemas["RepositoryAsk"] = {};

  if (adding) {
    if (text(held.name) === null) return null;

    change.name = (held.name as string).trim();
  }

  for (const field of ["label", "path", "nodeName", "preamble", "rules", "devCommand"] as const) {
    if (!(field in held)) continue;
    if (held[field] !== null && typeof held[field] !== "string") return null;

    change[field] = held[field] as string | null;
  }

  if ("supportCount" in held) {
    if (!wholeFrom(held.supportCount, 0)) return null;

    change.supportCount = held.supportCount;
  }

  if ("prefixDocuments" in held) {
    if (!Array.isArray(held.prefixDocuments) || !held.prefixDocuments.every((one) => typeof one === "string")) return null;

    change.prefixDocuments = held.prefixDocuments as string[];
  }

  if ("pin" in held) {
    const pin = held.pin === null ? null : record(held.pin);

    if (pin !== null && (text(pin.provider) === null || text(pin.model) === null)) return null;

    change.pin = pin === null ? null : { provider: pin.provider as string, model: pin.model as string };
  }

  if ("downgradeHeal" in held) {
    if (typeof held.downgradeHeal !== "boolean") return null;

    change.downgradeHeal = held.downgradeHeal;
  }

  if ("sampling" in held) {
    const sampling = samplingAsked(held.sampling);

    if (sampling === null) return null;

    change.sampling = sampling;
  }

  if ("nodeCheckouts" in held) {
    if (adding) return null;

    const checkouts = nodeCheckoutsAsked(held.nodeCheckouts);

    if (checkouts === null) return null;

    change.nodeCheckouts = checkouts;
  }

  if (!adding && Object.keys(change).length === 0) return null;

  return change;
}

export async function addRepository(change: Schemas["RepositoryAsk"]): Promise<RepositoryView> {
  return repositoryViewOf(await agencyCall(agency().POST("/repositories", { body: change })));
}

export async function changeRepository(name: string, change: Schemas["RepositoryAsk"]): Promise<RepositoryView> {
  return repositoryViewOf(await agencyCall(agency().PATCH("/repositories/{repositoryName}", { params: { path: { repositoryName: name } }, body: change })));
}

// A repository a job holds a checkout of is not removed.
const REPOSITORY_REMOVAL_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.repository_delete_refused" };

export async function removeRepository(name: string): Promise<void> {
  await agencyCall(agency().DELETE("/repositories/{repositoryName}", { params: { path: { repositoryName: name } } }), { codes: REPOSITORY_REMOVAL_CODES });
}

/** The rooms a supervisor's turns went into, the latest first, each with its latest run there (the agency's `docs/api.md`,
 * 「supervisors」). */
export async function readSupervisorRooms(name: string): Promise<SupervisorRoomView[]> {
  const page = await agencyCall(agency().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: name } } }));

  return page.items.map((room) => ({ chatId: room.roomId, runs: room.runs, lastRun: room.lastRunUnit, lastStartedAt: room.lastStartedAt, lastFinishedAt: room.lastFinishedAt }));
}

/** The stand-in that answers a supervisor now: where the agency names one and the supervisor's last turn went out on it
 * rather than on the first provider of its order; none otherwise (docs/boundary.md, 「Gaps the console meets」). */
export async function readStandIn(name: string): Promise<StandInView | null> {
  const [supervisor, standIn] = await Promise.all([
    agencyCall(agency().GET("/supervisors/{supervisorName}", { params: { path: { supervisorName: name } } })),
    agencyCall(agency().GET("/stand-in", { params: { query: { agent: name } } }))
  ]);
  const first = orderOf(supervisor.order)[0]?.provider ?? null;

  if (!standIn.answers || standIn.provider === null || standIn.model === null) return null;
  if (supervisor.provider !== standIn.provider || first === standIn.provider) return null;

  return { provider: providerLabelOf(standIn.provider, standIn.provider), model: standIn.model };
}

/** The nodes the agency places jobs on, in the node list's order, each by its label and how it is reached in the pack's
 * words (the agency's `docs/work-nodes.md`, 「Which nodes take jobs」). */
export async function readWorkNodes(): Promise<WorkNodeView[]> {
  const page = await agencyCall(agency().GET("/nodes"));

  return page.items.filter((node) => node.takesJobs).map((node) => ({ name: node.name, label: node.label === "" ? node.name : node.label, kind: nodeKindWord(node.kind) }));
}

// How a node is reached, in the pack's words: SSH, or the hub's own word for a node reached through one, which the agency
// calls `jake`.
function nodeKindWord(kind: string): string {
  if (kind === "ssh") return wording("hardware.label.kind_ssh");
  if (kind === "jake") return wording("hardware.label.kind_hub");

  return wording("agents.label.unknown_code", { code: kind });
}

/** The name a route's path names, or a refusal where it names none. */
export function axisName(value: string | undefined): string {
  const name = (value ?? "").trim();

  if (name === "") throw fail(400, wording("common.error.bad_action"));

  return name;
}
