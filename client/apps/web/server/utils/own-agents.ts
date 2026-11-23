import { isOwnRoad } from "#shared/own-agents";
import { wording } from "#shared/wording";

import { agencyRoute } from "./agency";
import { fail } from "./fail";
import { unitNamed } from "./organisation-agents";

import type { SignedIn } from "./accounts";
import type { AgencyCall } from "./agency";
import type { DecidedBy } from "#shared/organisation-agents";
import type { InstructedAgent, OwnAgentView, OwnAgentsView, OwnInstructionsView, OwnModel, OwnPermission, OwnProvider, OwnRoad, OwnRoleView } from "#shared/own-agents";

// The reader's own agents and instructions (docs/web.md, 「Settings」, the own-agents section; the agency's
// `docs/api.md`, 「own-agents」): asked of the agency as the deployment's own for the account the signed-in login is,
// so a reader reaches their own alone. Whether they may make a change is the delegation chain's word, which the agency
// reads for them; each link it names is said here by the unit's name.

// The agency's refusals of these routes, each with the pack's key for its sentence.
const CALL: AgencyCall = {
  codes: {
    "own-agents-withheld": "own_agents.error.add_withheld",
    "road-choice-withheld": "own_agents.error.road_withheld",
    "instructions-withheld": "own_agents.error.instructions_withheld",
    "road-not-supplied": "own_agents.error.not_supplied",
    "role-off": "own_agents.error.role_off",
    "too-many-agents": "own_agents.error.too_many",
    "supplied-agent": "own_agents.error.supplied",
    "agent-busy": "own_agents.error.busy",
    "unknown-agent": "own_agents.error.unknown_agent",
    "bad-instructions": "own_agents.error.bad_instructions",
    "not-supplied": "own_agents.error.not_found",
    "not-found": "own_agents.error.not_found",
    locked: "org_agents.error.locked",
    "access-unchecked": "org_agents.error.unchecked"
  },
  passStatus: [403, 404, 409, 422]
};

// The account a login's agents stand under: its user's id; a login with no user holds none.
function accountOf(signed: SignedIn): string {
  if (signed.id === null) throw fail(404, wording("own_agents.error.no_user"));

  return String(signed.id);
}

interface AgencyRoad {
  provider?: unknown;
  model?: unknown;
  effort?: unknown;
}

interface AgencyAgent {
  name?: unknown;
  agent?: { provider?: unknown; model?: unknown; effort?: unknown; enabled?: unknown; carries?: unknown } | null;
  supplied?: { road?: AgencyRoad | null; from?: unknown } | null;
  changed?: unknown;
}

interface AgencyRole {
  role?: unknown;
  label?: unknown;
  line?: unknown;
  off?: unknown;
  offFrom?: unknown;
  most?: unknown;
  agents?: AgencyAgent[];
}

interface AgencyPermission {
  allowed?: unknown;
  from?: unknown;
}

interface AgencyOwnAgents {
  add?: AgencyPermission;
  road?: AgencyPermission;
  roles?: AgencyRole[];
  providers?: { name?: unknown; label?: unknown; lines?: unknown }[];
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function roadOf(value: AgencyRoad | null | undefined): OwnRoad | null {
  const provider = textOf(value?.provider);
  const model = textOf(value?.model);

  return provider === null || model === null ? null : { provider, model, effort: textOf(value?.effort) };
}

// Who a link is, each link named once however often it stands.
function namer(): (link: unknown) => Promise<DecidedBy> {
  const named = new Map<string, Promise<DecidedBy>>();

  return async (link) => {
    const key = textOf(link);

    if (key === null) return null;
    if (!named.has(key)) named.set(key, unitNamed(key));

    return await named.get(key)!;
  };
}

async function permissionOf(value: AgencyPermission | undefined, name: (link: unknown) => Promise<DecidedBy>): Promise<OwnPermission> {
  const allowed = value?.allowed !== false;

  return { allowed, decided: allowed ? null : ((await name(value?.from)) ?? { by: "platform" }) };
}

async function agentOf(value: AgencyAgent, name: (link: unknown) => Promise<DecidedBy>): Promise<OwnAgentView> {
  const agent = value.agent ?? null;
  const supplied = value.supplied ?? null;

  return {
    name: String(value.name ?? ""),
    held: agent !== null,
    road: agent === null ? roadOf(supplied?.road) : roadOf(agent),
    enabled: agent === null ? false : agent.enabled !== false,
    carries: agent?.carries === true,
    // A seat no link named is the platform's own rule.
    supplied: supplied === null ? null : { road: roadOf(supplied.road), by: (await name(supplied.from)) ?? { by: "platform" } },
    changed: value.changed === true || (supplied !== null && agent === null)
  };
}

/** The reader's agents: every role as it stands for them, the seats supplied first, and what they may change. */
export async function ownAgents(signed: SignedIn): Promise<OwnAgentsView> {
  const read = await agencyRoute<AgencyOwnAgents>("GET", `/own-agents/${accountOf(signed)}`, undefined, CALL);
  const name = namer();
  const roles = await Promise.all(
    (read.roles ?? []).map(
      async (role): Promise<OwnRoleView> => ({
        role: String(role.role ?? ""),
        label: textOf(role.label) ?? String(role.role ?? ""),
        line: String(role.line ?? ""),
        off: role.off === true,
        offBy: role.off === true ? ((await name(role.offFrom)) ?? { by: "platform" }) : null,
        most: typeof role.most === "number" ? role.most : 0,
        agents: await Promise.all((role.agents ?? []).map(async (agent) => await agentOf(agent, name)))
      })
    )
  );
  const providers: OwnProvider[] = (read.providers ?? []).map((one) => ({
    name: String(one.name ?? ""),
    label: textOf(one.label) ?? String(one.name ?? ""),
    lines: Array.isArray(one.lines) ? one.lines.filter((line): line is string => typeof line === "string") : []
  }));

  return { add: await permissionOf(read.add, name), road: await permissionOf(read.road, name), roles, providers };
}

/** The models of a provider the reader may stand an agent on, each with whether their supply carries it now. */
export async function ownModels(signed: SignedIn, provider: string): Promise<OwnModel[]> {
  const read = await agencyRoute<{ models?: { id?: unknown; efforts?: unknown; inService?: unknown; supplied?: unknown }[] }>(
    "GET",
    `/own-agents/${accountOf(signed)}/models/${encodeURIComponent(provider)}`,
    undefined,
    CALL
  );

  return (read.models ?? []).map((one) => ({
    id: String(one.id ?? ""),
    efforts: Array.isArray(one.efforts) ? one.efforts.map((effort) => (typeof effort === "string" ? effort : null)) : [],
    inService: typeof one.inService === "boolean" ? one.inService : null,
    supplied: one.supplied === true
  }));
}

// The road a write sends: a provider with its model and effort, or both null to follow the asker.
function roadBody(road: OwnRoad | null): Record<string, string | null> {
  return road === null ? { provider: null, model: null, effort: null } : { provider: road.provider, model: road.model, effort: road.effort };
}

/** An agent of the reader's own added to a role, on the road named or on the role's own agent's. */
export async function addOwnAgent(signed: SignedIn, role: string, road: OwnRoad | undefined): Promise<void> {
  await agencyRoute("POST", `/own-agents/${accountOf(signed)}`, { role, ...(road === undefined ? {} : roadBody(road)) }, CALL);
}

/** One of the reader's agents laid on another road, or switched on or off. */
export async function changeOwnAgent(signed: SignedIn, agent: string, change: { road?: OwnRoad | null; enabled?: boolean }): Promise<void> {
  const body = { ...(change.road === undefined ? {} : roadBody(change.road)), ...(change.enabled === undefined ? {} : { enabled: change.enabled }) };

  await agencyRoute("PATCH", `/own-agents/${accountOf(signed)}/${encodeURIComponent(agent)}`, body, CALL);
}

/** A seat supplied to the reader standing again as supplied. */
export async function ownAgentBack(signed: SignedIn, agent: string): Promise<void> {
  await agencyRoute("POST", `/own-agents/${accountOf(signed)}/${encodeURIComponent(agent)}/back`, undefined, CALL);
}

/** An agent of the reader's own removed. */
export async function removeOwnAgent(signed: SignedIn, agent: string): Promise<void> {
  await agencyRoute("DELETE", `/own-agents/${accountOf(signed)}/${encodeURIComponent(agent)}`, undefined, CALL);
}

interface AgencyInstructions {
  allowed?: AgencyPermission;
  all?: unknown;
  agents?: Record<string, unknown>;
  named?: { name?: unknown; label?: unknown; kind?: unknown; role?: unknown }[];
  organisation?: { from?: unknown; text?: unknown }[];
  mostCharacters?: unknown;
}

async function instructionsOf(read: AgencyInstructions): Promise<OwnInstructionsView> {
  const name = namer();
  const agents = Object.fromEntries(Object.entries(read.agents ?? {}).flatMap(([agent, text]) => (typeof text === "string" ? [[agent, text]] : [])));
  const named: InstructedAgent[] = (read.named ?? []).map((one) => ({
    name: String(one.name ?? ""),
    label: textOf(one.label),
    kind: one.kind === "supervisor" ? "supervisor" : "agent",
    role: textOf(one.role)
  }));

  return {
    allowed: await permissionOf(read.allowed, name),
    all: textOf(read.all),
    agents,
    named,
    organisation: await Promise.all((read.organisation ?? []).map(async (one) => ({ by: (await name(one.from)) ?? { by: "platform" }, text: String(one.text ?? "") }))),
    mostCharacters: typeof read.mostCharacters === "number" ? read.mostCharacters : 0
  };
}

/** The reader's own instructions, whether they may give any, and their organisation's, which stand before them. */
export async function ownInstructions(signed: SignedIn): Promise<OwnInstructionsView> {
  return await instructionsOf(await agencyRoute<AgencyInstructions>("GET", `/own-instructions/${accountOf(signed)}`, undefined, CALL));
}

/** The reader's own instructions written whole. */
export async function setOwnInstructions(signed: SignedIn, all: string | null, agents: Record<string, string>): Promise<OwnInstructionsView> {
  return await instructionsOf(await agencyRoute<AgencyInstructions>("PUT", `/own-instructions/${accountOf(signed)}`, { all, agents }, CALL));
}

/** A road as a request's body gives it: undefined where none is given, null to follow the asker. */
export function roadIn(value: unknown): OwnRoad | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isOwnRoad(value)) throw fail(400, wording("organization.error.bad_request"));

  return { provider: value.provider, model: value.model, effort: value.effort ?? null };
}
