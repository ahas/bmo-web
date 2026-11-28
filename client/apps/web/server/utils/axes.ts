import { wording } from "#shared/wording";

import { agency, agencyCall } from "./agency";
import { defaultAnswerer, ownerStanding } from "./owner";
import { bundleWordOf, providerLabelOf, roadReasonOf } from "./agency-words";

import type { Provider, Repository, Role, Supervisor } from "@agency/client";
import type { components } from "@agency/client/schema";
import type { H3Event } from "h3";
import type { GenerationSetting } from "#shared/agency";
import type { RefusalBody } from "./unit-answer";
import type { CheckoutView, NodeCheckoutAsk, ProviderModelsView, ProviderModelView, ProviderView, RepositoryView, RoadView, RoleAgentView, RoleBundleView, RoleSessionPage, RoleSessionView, RolesView, RoleView, SupervisorRoadStateView, SupervisorRoomView, SupervisorView, SupportCount, WorkNodeView } from "#shared/axes";

type Schemas = components["schemas"];

// The agency's two axes and its places, read and changed through its routes (the agency's `docs/api.md`,
// 「supervisors」, 「roles」, 「repositories, prefix-checks and room-holdings」 and 「providers, models and model files」),
// in the shapes the agent management screen reads. A field the published types leave untyped is read as the agency's
// document states it, defensively: a field that does not read as its shape stands as none.
// A read or change made for agent management's tabs or an agent's page is handed the request it is made for, so the
// agency asks it as the person signed in on it (docs/boundary.md, 「Calls the console makes」); a read handed none is
// the deployment's own, for the console's own bookkeeping.

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const record = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A road read off what holds its fields — an agency's row or a screen's body; none where it names no provider and
 * model. */
export function roadOf(value: unknown): RoadView | null {
  const held = record(value);
  const provider = text(held.provider);
  const model = text(held.model);

  if (provider === null || model === null) return null;

  return { provider, model, effort: text(held.effort), thinking: text(held.thinking), answerTokens: number(held.answerTokens), advisor: text(held.advisor) };
}

/** One provider as the screen reads it: the pack's word for its code, its switch, its lines and its reason. */
export function providerViewOf(provider: Provider): ProviderView {
  const held = record(provider);
  const said = roadReasonOf(held.reason, held.reasonCode);

  return {
    name: provider.name,
    label: providerLabelOf(provider.code, provider.name),
    enabled: provider.enabled,
    registered: provider.registered,
    lines: list(held.lines).filter((one): one is string => typeof one === "string"),
    reason: said.reason,
    reasonEnglish: said.reasonEnglish,
    foldRatioDefault: number(held.foldRatioDefault),
    keyFile: text(held.keyFile),
    takesWorkspace: held.takesWorkspace === true,
    workspace: text(held.workspace),
    ownersEngine: provider.ownersEngine,
    takesAdvisor: provider.takesAdvisor,
    advisorWords: provider.takesAdvisor ? provider.advisorWords : []
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

/** The workspace a provider's requests are spent in set, null for the key's default (the agency's
 * `docs/provider-presence.md`, 「A provider's workspace」). */
export async function setProviderWorkspace(name: string, workspace: string | null): Promise<ProviderView> {
  return providerViewOf(await agencyCall(agency().PATCH("/providers/{providerName}", { params: { path: { providerName: name } }, body: { workspace } })));
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

// A person's own BMO's name: `u<user>`, the user's id written as a decimal number with no leading zero (docs/accounts.md,
// 「Invitations and a person's machine」).
const PERSONS_BMO = /^u([1-9][0-9]*)$/;

/**
 * The account a supervisor is the BMO of (docs/accounts.md, 「Whose BMO a supervisor is」): the account the agency
 * files it under where it names one; else, where its name is exactly a person's BMO's, `u<user>`, that user, since the
 * BMOs a person's account was given before the receiver passed the account on to the agency stand there under no
 * owner; else nobody's, which is the administrator's.
 */
export function supervisorOwner(supervisor: { name: string; ownerAccount?: number | null }): number | null {
  if (supervisor.ownerAccount !== undefined && supervisor.ownerAccount !== null) return supervisor.ownerAccount;

  const user = PERSONS_BMO.exec(supervisor.name)?.[1];

  return user === undefined ? null : Number(user);
}

/** The owner's account, as the console's account standing names it; none where it cannot be told. */
async function ownersAccount(): Promise<number | null> {
  return ownerStanding().then((standing) => standing.account, () => null);
}

/**
 * Whether a supervisor's program runs as the owner's own user on this machine (the agency's `docs/supervisors.md`,
 * 「What confines a session allowed files」): the account the agency itself files it under is none or the owner's. The
 * name of a person's BMO is not read here, since the agency confines a supervisor by its filed account alone.
 */
function runsAsOwner(supervisor: Supervisor, owner: number | null): boolean {
  const filed = supervisor.ownerAccount ?? null;

  return filed === null || filed === owner;
}

/** One supervisor as the screen reads it, marked as the default answerer where the receiver's setting names it, and
 * as running as the owner's own user by the owner's account `owner`. */
export function supervisorViewOf(supervisor: Supervisor, answerer: string | null, owner: number | null): SupervisorView {
  const warming: Record<string, boolean> = {};

  for (const [provider, on] of Object.entries(record(supervisor.warming))) {
    if (typeof on === "boolean") warming[provider] = on;
  }

  return {
    name: supervisor.name,
    label: supervisor.label ?? supervisor.name,
    ownerAccount: supervisorOwner(supervisor),
    runsAsOwner: runsAsOwner(supervisor, owner),
    icon: supervisor.icon,
    aliases: supervisor.aliases,
    nameTag: supervisor.nameTag ?? null,
    sessionScope: supervisor.sessionScope,
    turnShape: supervisor.turnShape,
    defaultAnswerer: supervisor.name === answerer,
    seeded: supervisor.seeded,
    repository: supervisor.repository,
    road: roadOf(supervisor),
    warming,
    foldRatio: supervisor.foldRatio
  };
}

/** The owner parameters an address may give a list of the agency's reached rows (the agency's `docs/api.md`,
 * 「Who a caller acts for」): one account, or one unit and — where asked — the units under it. */
export type OwnerParams = { ownerAccount?: number; unit?: number; unitSubtree?: boolean };

/** The owner parameters of a route's query, read for shape alone: one not whole answers as none named, since an
 * unscoped list stands on the reader's own reach as it always did. */
export function ownerParamsOf(query: Record<string, unknown>): OwnerParams | undefined {
  const named = (value: unknown): number | undefined => (typeof value === "string" && /^[1-9][0-9]*$/.test(value) ? Number(value) : undefined);
  const ownerAccount = named(query.ownerAccount);
  const unit = named(query.unit);

  if (ownerAccount === undefined && unit === undefined) return undefined;

  return {
    ...(ownerAccount === undefined ? {} : { ownerAccount }),
    ...(unit === undefined ? {} : { unit, ...(query.unitSubtree === "true" || query.unitSubtree === true ? { unitSubtree: true } : {}) })
  };
}

/** The options a scoped read carries to the agency's list route. */
function scoped(scope: OwnerParams) {
  return { params: { query: scope } };
}

export async function readSupervisors(madeFor?: H3Event, scope?: OwnerParams): Promise<SupervisorView[]> {
  const [page, answerer, owner] = await Promise.all([
    agencyCall(scope === undefined ? agency(madeFor).GET("/supervisors") : agency(madeFor).GET("/supervisors", scoped(scope))),
    defaultAnswerer(),
    ownersAccount()
  ]);

  return page.items.map((supervisor) => supervisorViewOf(supervisor, answerer, owner));
}

export async function readSupervisor(name: string, madeFor: H3Event): Promise<SupervisorView> {
  const [supervisor, answerer, owner] = await Promise.all([agencyCall(agency(madeFor).GET("/supervisors/{supervisorName}", { params: { path: { supervisorName: name } } })), defaultAnswerer(), ownersAccount()]);

  return supervisorViewOf(supervisor, answerer, owner);
}

/** The supervisors the account owns, by name and label, in the agency's order: the first is the account's own BMO. */
export async function supervisorsOwnedBy(account: number): Promise<{ name: string; label: string }[]> {
  const page = await agencyCall(agency().GET("/supervisors"));

  return page.items.filter((supervisor) => supervisorOwner(supervisor) === account).map((supervisor) => ({ name: supervisor.name, label: supervisor.label ?? supervisor.name }));
}

/**
 * Whether the agency registers `name` and the login account `account` owns it (the agency's
 * `docs/agent-ownership.md`): a group room names only its creator's supervisor, and none another person's.
 */
export async function supervisorOwnedBy(name: string, account: number | null): Promise<boolean> {
  if (account === null) return false;

  const page = await agencyCall(agency().GET("/supervisors"));

  return page.items.some((supervisor) => supervisor.name === name && supervisorOwner(supervisor) === account);
}

/** A supervisor's change as a screen sent it, each field of its own shape; null where the body names none. */
export function supervisorChangeOf(body: unknown): Schemas["SupervisorChange"] | null {
  const held = record(body);
  const change: Schemas["SupervisorChange"] = {};

  if (typeof held.label === "string" && held.label.trim() !== "") change.label = held.label.trim();
  // A road is sent whole, so a changed provider or model never keeps a field of the one before it.
  if ("road" in held) {
    const road = roadOf(held.road);

    if (road === null) return null;

    Object.assign(change, road);
  }
  if (typeof held.foldRatio === "number") change.foldRatio = held.foldRatio;
  // A name tag emptied goes back to the default.
  if ("nameTag" in held) change.nameTag = typeof held.nameTag === "string" && held.nameTag.trim() !== "" ? held.nameTag.trim() : null;
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

// A road's advisor the agency refuses, one ranking below the road's model among them, is said in its own words under
// the advisor; every other refused field in the common words.
const ROAD_REFUSALS: Readonly<Record<string, string>> = { advisor: "agents.error.advisor_refused" };

export async function changeSupervisor(name: string, change: Schemas["SupervisorChange"], madeFor: H3Event): Promise<SupervisorView> {
  // The two reads the answer needs go beside the change, and a refused change waits for them before it is said, so
  // no read is still running on the receiver once the call has answered.
  const reads = Promise.all([defaultAnswerer(), ownersAccount()]);
  let supervisor: Supervisor;

  try {
    supervisor = await agencyCall(agency(madeFor).PATCH("/supervisors/{supervisorName}", { params: { path: { supervisorName: name } }, body: change }), { fields: ROAD_REFUSALS });
  } catch (error) {
    await reads.catch(() => undefined);

    throw error;
  }

  const [answerer, owner] = await reads;

  return supervisorViewOf(supervisor, answerer, owner);
}

// A bundle is worded by its code, the name with each dot a hyphen (the agency's `docs/api.md`, 「roles」).
function bundleOf(bundle: Schemas["RoleBundle"]): RoleBundleView {
  return { name: bundle.name, label: bundleWordOf(bundle.code, bundle.name) };
}

// Whether an agent or a role follows the supervisor that asks a run of it (the agency's `docs/role-agents.md`, 「An
// agent that follows its asker」), a field the vendored client does not name yet.
interface Following {
  followsAsker?: boolean | null;
}

/** One agent of a role as the screen reads it (docs/web.md, the roles tab). */
export function roleAgentViewOf(agent: Schemas["RoleAgent"] & Following): RoleAgentView {
  return {
    name: agent.name,
    role: agent.role,
    provider: agent.provider ?? null,
    model: agent.model ?? null,
    effort: agent.effort ?? null,
    thinking: agent.thinking ?? null,
    answerTokens: agent.answerTokens ?? null,
    advisor: agent.advisor ?? null,
    enabled: agent.enabled,
    keepsCache: agent.keepsCache,
    sessions: agent.sessions,
    foldRatio: agent.foldRatio ?? null,
    prompt: agent.prompt ?? null,
    bundles: agent.bundles ?? null,
    skills: agent.skills ?? null,
    followsAsker: agent.followsAsker ?? null,
    followsSupervisor: agent.followsSupervisor ?? (agent.provider == null),
    carries: agent.carries ?? false,
    fallbacks: (agent.fallbacks ?? []).map((road) => ({
      provider: road.provider,
      model: road.model,
      effort: road.effort ?? null,
      thinking: road.thinking ?? null,
      answerTokens: road.answerTokens ?? null,
      advisor: road.advisor ?? null
    }))
  };
}

/** The roads a role's runs go out on: its agents that are switched on and name one, each road once, in their order. */
export function roadsOf(agents: readonly Schemas["RoleAgent"][]): RoadView[] {
  const roads: RoadView[] = [];

  for (const agent of agents) {
    if (!agent.enabled || agent.provider == null || agent.model == null) continue;
    if (roads.some((road) => road.provider === agent.provider && road.model === agent.model)) continue;

    roads.push({ provider: agent.provider, model: agent.model, effort: agent.effort ?? null, thinking: agent.thinking ?? null, answerTokens: agent.answerTokens ?? null, advisor: agent.advisor ?? null });
  }

  return roads;
}

/** One role as the screen reads it, named by its name on every screen (docs/web.md, the roles tab). */
export function roleViewOf(role: Role & Following): RoleView {
  return {
    name: role.name,
    label: role.label,
    description: role.description,
    prompt: role.prompt,
    providerPrompts: { ...role.providerPrompts },
    bundles: role.bundles.map(bundleOf),
    skills: role.skills ?? null,
    line: role.line,
    agents: (role.agents ?? []).map(roleAgentViewOf),
    roads: roadsOf(role.agents ?? []),
    maxConcurrent: role.maxConcurrent,
    followsAsker: role.followsAsker ?? false,
    running: role.running,
    waiting: role.waiting,
    provider: role.provider,
    waitingFor: role.waitingFor
  };
}

/** Every role, each as `listed` keeps it of what the agency answers: whole where none is named. Where the read
 * names an owner, the roles stay the platform's list and each role's agents are the node's own, read from the
 * agency's reached agents list rather than the whole the role answer embeds (the agency's `docs/api.md`,
 * 「Who a caller acts for」). */
export async function readRoles(listed: (role: Role) => Role = (role) => role, madeFor?: H3Event, scope?: OwnerParams): Promise<RolesView> {
  const [answer, reached] = await Promise.all([
    agencyCall(agency(madeFor).GET("/roles")),
    scope === undefined ? Promise.resolve(null) : agencyCall(agency(madeFor).GET("/role-agents", scoped(scope)))
  ]);

  const kept = (role: Role): Role => {
    if (scope === undefined) return listed(role);
    if (reached === null) return { ...role, agents: [] };

    return { ...role, agents: reached.items.filter((one) => one.role === role.name) };
  };

  return { roles: answer.roles.map((role) => roleViewOf(kept(role))), bundles: answer.bundles.map(bundleOf), skills: answer.skills ?? [], lines: answer.lines };
}

const SESSIONS = ["keep", "fresh"] as const;
const wholeFrom = (value: unknown, least: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= least;

/**
 * A role's change as a screen sent it, every field checked for its shape and nothing else: a new role needs its name,
 * its label, its bundles and its line; a change any one field. An emptied prompt or description is a cleared one, and
 * so are skills given as null and a provider's prompt emptied or given as null. Null
 * where the body does not read as one; whether the values stand is the agency's to say.
 */
export function roleChangeOf(body: unknown, adding: boolean): (Schemas["RoleChange"] & Following & { name?: string }) | null {
  const held = record(body);
  const change: Schemas["RoleChange"] & Following & { name?: string } = {};

  if ("followsAsker" in held) {
    if (typeof held.followsAsker !== "boolean") return null;

    change.followsAsker = held.followsAsker;
  }

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

  if ("skills" in held) {
    if (held.skills !== null && (!Array.isArray(held.skills) || !held.skills.every((one) => text(one) !== null))) return null;

    change.skills = held.skills === null ? null : (held.skills as string[]).map((one) => one.trim());
  }

  for (const field of ["prompt", "description"] as const) {
    if (!(field in held)) continue;
    if (held[field] !== null && typeof held[field] !== "string") return null;

    change[field] = text(typeof held[field] === "string" ? (held[field] as string).trim() : null) === null ? null : (held[field] as string);
  }

  if ("providerPrompts" in held) {
    if (held.providerPrompts === null || typeof held.providerPrompts !== "object" || Array.isArray(held.providerPrompts)) return null;

    const prompts = record(held.providerPrompts);

    if (!Object.values(prompts).every((one) => one === null || typeof one === "string")) return null;

    change.providerPrompts = Object.fromEntries(
      Object.entries(prompts).map(([provider, one]) => [provider, typeof one === "string" && one.trim() !== "" ? one : null])
    );
  }

  if (adding && (change.label === undefined || change.bundles === undefined || change.line === undefined)) return null;
  if (!adding && Object.keys(change).length === 0) return null;

  return change;
}

/** A new role; on a new role the agency is sent no prompt or description it was not given. */
export async function addRole(change: Schemas["RoleChange"] & { name?: string }, madeFor: H3Event): Promise<RoleView> {
  const { name, label, bundles, line } = change;

  if (name === undefined || label == null || bundles == null || line == null) throw fail(400, wording("common.error.bad_action"));

  const body: Schemas["RoleAsk"] = { name, label, bundles, line };

  if (change.prompt != null) body.prompt = change.prompt;
  if (change.description != null) body.description = change.description;
  if (change.skills != null) body.skills = change.skills;

  const prompts = Object.entries(change.providerPrompts ?? {}).filter((entry): entry is [string, string] => entry[1] !== null);

  if (prompts.length > 0) body.providerPrompts = Object.fromEntries(prompts);

  return roleViewOf(await agencyCall(agency(madeFor).POST("/roles", { body })));
}

export async function changeRole(name: string, change: Schemas["RoleChange"] & { name?: string }, madeFor: H3Event): Promise<RoleView> {
  const { name: _name, ...body } = change;

  return roleViewOf(await agencyCall(agency(madeFor).PATCH("/roles/{roleName}", { params: { path: { roleName: name } }, body })));
}

// A role still going or waiting, or one the policy names as a default, is not removed.
const ROLE_REMOVAL_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.role_delete_refused" };

export async function removeRole(name: string, madeFor: H3Event): Promise<void> {
  await agencyCall(agency(madeFor).DELETE("/roles/{roleName}", { params: { path: { roleName: name } } }), { codes: ROLE_REMOVAL_CODES });
}

// The fields of an agent a screen may send, each with the shape it takes; null clears a field that may be cleared.
const AGENT_TEXTS = ["provider", "model", "effort", "thinking", "advisor", "prompt"] as const;
const AGENT_LISTS = ["bundles", "skills"] as const;

/**
 * An agent's change as a screen sent it, every field checked for its shape and nothing else: a new agent needs its
 * role; a change any one field. Null where the body does not read as one; whether the values stand is the agency's to
 * say.
 */
export function roleAgentChangeOf(body: unknown, adding: boolean): (Schemas["RoleAgentChange"] & Following & { role?: string; name?: string; ownerUnit?: number }) | null {
  const held = record(body);
  const change: Schemas["RoleAgentChange"] & Following & { role?: string; name?: string; ownerUnit?: number } = {};

  if ("followsAsker" in held) {
    if (held.followsAsker !== null && typeof held.followsAsker !== "boolean") return null;

    change.followsAsker = held.followsAsker;
  }

  if (adding) {
    if (text(held.role) === null) return null;

    change.role = (held.role as string).trim();

    if ("name" in held && held.name !== null) {
      if (text(held.name) === null) return null;

      change.name = (held.name as string).trim();
    }

    // A row filed under a unit is its head's to file; the agency judges the heading (the agency's `docs/api.md`,
    // 「Who a caller acts for」), this only lets a whole number through.
    if ("ownerUnit" in held && held.ownerUnit !== undefined && held.ownerUnit !== null) {
      if (!wholeFrom(held.ownerUnit, 1)) return null;

      change.ownerUnit = held.ownerUnit as number;
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

  if ("sessions" in held) {
    if (!SESSIONS.includes(held.sessions as (typeof SESSIONS)[number])) return null;

    change.sessions = held.sessions as (typeof SESSIONS)[number];
  }

  for (const field of ["enabled", "keepsCache"] as const) {
    if (!(field in held)) continue;
    if (typeof held[field] !== "boolean") return null;

    change[field] = held[field] as boolean;
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

// An agent that carries a run is not removed, and a name already taken is not given again. An advisor the agency
// refuses is said under the agent's advisor: the agency answers it with no field, its sentence beginning `advisor: `
// (the agency's `docs/api.md`, 「roles」).
const AGENT_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.role_agent_refused", "advisor-refused": "agents.error.advisor_refused" };
const ADVISOR_REFUSED = "advisor: ";

function agentRefusal(body: RefusalBody): RefusalBody {
  return body.error?.startsWith(ADVISOR_REFUSED) === true ? { ...body, code: "advisor-refused", field: "advisor" } : body;
}

export async function addRoleAgent(change: Schemas["RoleAgentChange"] & { role?: string; name?: string }, madeFor?: H3Event): Promise<RoleAgentView> {
  const { role, ...fields } = change;

  if (role === undefined) throw fail(400, wording("common.error.bad_action"));

  // The write goes as the caller, so the agency files the row by whose account or head it is and refuses the
  // filing it does not reach (the agency's `docs/role-agents.md`).
  return roleAgentViewOf(await agencyCall(agency(madeFor).POST("/role-agents", { body: { role, ...fields } }), { codes: AGENT_CODES, refusal: agentRefusal }));
}

export async function changeRoleAgent(name: string, change: Schemas["RoleAgentChange"] & { role?: string; name?: string }, madeFor?: H3Event): Promise<RoleAgentView> {
  const { role: _role, name: _name, ...body } = change;

  return roleAgentViewOf(await agencyCall(agency(madeFor).PATCH("/role-agents/{agentName}", { params: { path: { agentName: name } }, body }), { codes: AGENT_CODES, refusal: agentRefusal }));
}

/** One fallback road added to an agent at `position`, last where none is named (the agency's `docs/role-agents.md`,
 * 「An agent's fallback roads」). */
export async function addRoleAgentFallback(name: string, road: Schemas["FallbackAdd"], madeFor?: H3Event): Promise<RoleAgentView> {
  return roleAgentViewOf(
    await agencyCall(agency(madeFor).POST("/role-agents/{agentName}/fallbacks", { params: { path: { agentName: name } }, body: road }), { codes: AGENT_CODES, refusal: agentRefusal })
  );
}

/** The fallback road of an agent at `position` removed. */
export async function removeRoleAgentFallback(name: string, position: number, madeFor?: H3Event): Promise<RoleAgentView> {
  return roleAgentViewOf(
    await agencyCall(agency(madeFor).DELETE("/role-agents/{agentName}/fallbacks/{position}", { params: { path: { agentName: name, position } } }), { codes: AGENT_CODES, refusal: agentRefusal })
  );
}

/** The fallback road of an agent at `position` moved to `to`. */
export async function moveRoleAgentFallback(name: string, position: number, to: number, madeFor?: H3Event): Promise<RoleAgentView> {
  return roleAgentViewOf(
    await agencyCall(agency(madeFor).POST("/role-agents/{agentName}/fallbacks/{position}/move", { params: { path: { agentName: name, position } }, body: { to } }), {
      codes: AGENT_CODES,
      refusal: agentRefusal
    })
  );
}

export async function removeRoleAgent(name: string, madeFor?: H3Event): Promise<void> {
  await agencyCall(agency(madeFor).DELETE("/role-agents/{agentName}", { params: { path: { agentName: name } } }), { codes: AGENT_CODES });
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
export async function readRoleSessions(name: string, before: number | null, limit: number, madeFor: H3Event): Promise<RoleSessionPage> {
  const query = before === null ? { limit } : { before, limit };
  const page = await agencyCall(agency(madeFor).GET("/roles/{roleName}/sessions", { params: { path: { roleName: name }, query } }));

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

// A support count as the agency answers or takes it, `auto` or a whole number; null where it is neither. Whether the
// number stands within the agency's bound is the agency's to say.
function supportCountOf(value: unknown): SupportCount | null {
  return value === "auto" || wholeFrom(value, 0) ? value : null;
}

/** One repository as the screen reads it; a support count that does not read as one stands as `auto`, the agency's
 * default. */
export function repositoryViewOf(repository: Repository): RepositoryView {
  return {
    name: repository.name,
    label: repository.label ?? repository.name,
    ownLabel: repository.label,
    icon: repository.icon,
    path: repository.path,
    nodeName: repository.nodeName,
    supportCount: supportCountOf(repository.supportCount) ?? "auto",
    umbrella: repository.umbrella,
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

/** Every repository `listed` keeps of what the agency answers: all of them where none is named. */
export async function readRepositories(listed: (rows: Repository[]) => Repository[], madeFor: H3Event, scope?: OwnerParams): Promise<RepositoryView[]> {
  const page = await agencyCall(scope === undefined ? agency(madeFor).GET("/repositories") : agency(madeFor).GET("/repositories", scoped(scope)));

  return listed(page.items).map(repositoryViewOf);
}

/** A repository's fields as a screen sent them, each of its own shape; null where any is not. */
export function repositoryChangeOf(body: unknown, adding: boolean): Schemas["RepositoryAsk"] | null {
  const held = record(body);
  const change: Schemas["RepositoryAsk"] = {};

  if (adding) {
    if (text(held.name) === null) return null;

    change.name = (held.name as string).trim();

    // Where the row is filed is the agency's judgement of the caller; these only carry a whole number through.
    for (const field of ["ownerAccount", "ownerUnit"] as const) {
      if (!(field in held) || held[field] === undefined || held[field] === null) continue;
      if (!wholeFrom(held[field], 1)) return null;

      change[field] = held[field] as number;
    }
  }

  for (const field of ["label", "path", "nodeName", "preamble", "rules", "devCommand"] as const) {
    if (!(field in held)) continue;
    if (held[field] !== null && typeof held[field] !== "string") return null;

    change[field] = held[field] as string | null;
  }

  if ("supportCount" in held) {
    const supportCount = supportCountOf(held.supportCount);

    if (supportCount === null) return null;

    change.supportCount = supportCount;
  }

  if ("umbrella" in held) {
    if (typeof held.umbrella !== "boolean") return null;

    change.umbrella = held.umbrella;
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

// An umbrella left with a support checkout or a node checkout is refused under its switch in words of its own.
const REPOSITORY_FIELDS: Readonly<Record<string, string>> = { umbrella: "agents.error.umbrella_refused" };

export async function addRepository(change: Schemas["RepositoryAsk"], madeFor: H3Event): Promise<RepositoryView> {
  return repositoryViewOf(await agencyCall(agency(madeFor).POST("/repositories", { body: change }), { fields: REPOSITORY_FIELDS }));
}

export async function changeRepository(name: string, change: Schemas["RepositoryAsk"], madeFor: H3Event): Promise<RepositoryView> {
  return repositoryViewOf(
    await agencyCall(agency(madeFor).PATCH("/repositories/{repositoryName}", { params: { path: { repositoryName: name } }, body: change }), { fields: REPOSITORY_FIELDS })
  );
}

// A repository a job holds a checkout of is not removed.
const REPOSITORY_REMOVAL_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.repository_delete_refused" };

export async function removeRepository(name: string, madeFor: H3Event): Promise<void> {
  await agencyCall(agency(madeFor).DELETE("/repositories/{repositoryName}", { params: { path: { repositoryName: name } } }), { codes: REPOSITORY_REMOVAL_CODES });
}

/** The rooms a supervisor's turns went into, the latest first, each with its latest run there (the agency's `docs/api.md`,
 * 「supervisors」). */
export async function readSupervisorRooms(name: string, madeFor: H3Event): Promise<SupervisorRoomView[]> {
  const page = await agencyCall(agency(madeFor).GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: name } } }));

  return page.items.map((room) => ({ chatId: room.roomId, runs: room.runs, lastRun: room.lastRunUnit, lastStartedAt: room.lastStartedAt, lastFinishedAt: room.lastFinishedAt }));
}

/** Whether a supervisor's road can take a turn now, as a turn's start judges it, with the agency's sentence for why where
 * it cannot (the agency's `docs/api.md`, 「supervisors」). */
export async function readSupervisorRoadState(name: string, madeFor: H3Event): Promise<SupervisorRoadStateView> {
  const road = await agencyCall(agency(madeFor).GET("/supervisors/{supervisorName}/road", { params: { path: { supervisorName: name } } }));

  return { answers: road.answers, reason: text(road.reason) };
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
