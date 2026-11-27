import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, keepUnitSecret, resolveChain, setChainDelegation, setChainRules, setChainValue } from "./account-service";
import { agency, agencyCall, agencyRoute } from "./agency";
import { readProviderModels } from "./axes";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";
import { unitNamed } from "./chain-names";

import type { ChainEntryView } from "./account-service";
import type { SignedIn } from "./accounts";
import type { OwnModel, OwnRoad } from "#shared/own-agents";
import type { ChainDelegation, CompositionChoice, CompositionView, SourceKind, UnitSourceView, UnitSupplyItem, UnitSupplyView } from "#shared/organisation-supply";
import type { H3Event } from "h3";

// An organisation's supply and agents (docs/web.md, 「System and organisation」, the supply and agents tabs; docs/accounts.md,
// 「Organisation supply」; the agency's `docs/supply.md`, 「Organisation supply」, and `docs/role-agents.md`, 「The agents
// an account is given」): whether organisation supply stands open is the account service's kind and the sign-up
// composition the agency's, both on the
// delegation chain, read and written on the chain's own routes as the signed-in login, so who writes a link and a
// lock above it are the account service's word; a unit's own keys and its composition are the agency's, asked as the
// signed-in login. A key's value goes from the form into the unit's space of the secret store and nowhere else.

/** The chain's kind of each source a unit opens or closes, as the account service declares it. */
const SOURCE_KINDS: Readonly<Record<SourceKind, string>> = {
  organisation: "supply.organisation",
  // The agency's kind, declared with its others (its `docs/supply.md`, 「A person's local AI」).
  "personal-local-ai": "supply.personal-local-ai"
};

/** What a unit opens or closes on the chain. */
export const SOURCES: readonly SourceKind[] = ["organisation", "personal-local-ai"];

/** The chain's kind of the sign-up composition. */
const COMPOSITION_KIND = "signup.composition";

const DELEGATIONS: readonly ChainDelegation[] = ["allow", "lock", "inherit"];

/** Whether a word is a delegation. */
export function isDelegation(value: unknown): value is ChainDelegation {
  return typeof value === "string" && (DELEGATIONS as readonly string[]).includes(value);
}

/** Whether a word names a source. */
export function isSource(value: unknown): value is SourceKind {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

// The codes the organisation's agents answer with, each with the pack's key for its sentence.
const CODES: Readonly<Record<string, string>> = {
  locked: "org_agents.error.locked",
  forbidden: "org_agents.error.forbidden",
  "organisation-supply-closed": "org_agents.error.closed",
  conflict: "org_agents.error.taken",
  "unknown-road": "org_agents.error.unknown_road",
  "bad-composition": "org_agents.error.bad_composition",
  "access-unchecked": "org_agents.error.unchecked"
};

/** What a call came to, in the pack's words. */
export function orgAgentsFailure(error: unknown): Error {
  return organizationFailure(error, CODES);
}

// A link's entry, or null where the reader may not read it.
async function entryOrNone(key: string, link: string, signed: SignedIn): Promise<ChainEntryView | null> {
  try {
    return await chainEntry(key, link, callerOf(signed));
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 403) return null;

    throw error;
  }
}

// What organisation supply resolves to for a unit: open only on the platform's own word for it, and no link below
// closing it, as the agency reads it.
function organisationOpen(layers: readonly { link: string; value: unknown }[], value: unknown): boolean {
  return value === true && layers.some((layer) => layer.link === "platform" && layer.value === true);
}

async function sourceAt(unit: number, source: SourceKind, signed: SignedIn): Promise<UnitSourceView | null> {
  const key = SOURCE_KINDS[source];
  const link = `unit:${unit}`;
  const [entry, resolved] = await Promise.all([entryOrNone(key, link, signed), resolveChain(key, { unit })]);

  if (entry === null) return null;

  return {
    source,
    // Organisation supply stands open only where the platform opened it; a person's local AI stands unless a link
    // closes it.
    stands: source === "organisation" ? organisationOpen(resolved.layers, resolved.value) : resolved.value !== false,
    closedHere: entry.value === false,
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null,
    locker: await unitNamed(entry.lockedBy)
  };
}

// Whether the platform's own link opens organisation supply to the company, by a rule naming it.
async function companyOpened(company: number, signed: SignedIn): Promise<boolean | null> {
  const entry = await entryOrNone(SOURCE_KINDS.organisation, "platform", signed);

  if (entry === null || !entry.writable) return null;

  return entry.rules.some((rule) => rule.who === `unit:${company}` && rule.value === true);
}

// The unit's own keys and accounts, none where the agency answers the reader no head of it.
async function itemsOf(event: H3Event, unit: number): Promise<UnitSupplyItem[] | null> {
  const answer = await agency(event).GET("/organisation-supply/{unit}", { params: { path: { unit } } });

  if (answer.response.status === 403) return null;

  const page = await agencyCall(Promise.resolve(answer), { codes: CODES });

  return page.items.map((one) => ({ id: one.id, road: one.road, secret: one.secret, enabled: one.enabled, refused: one.refusedAt !== null && one.refusedAt !== undefined }));
}

/** The agent supply of a unit as the reader stands to it; `company` says the unit is a company. */
export async function unitSupply(event: H3Event, unit: number, company: boolean, signed: SignedIn): Promise<UnitSupplyView> {
  // A kind the agency has not declared yet answers nothing, and leaves its row out rather than the tab.
  const at = async (source: SourceKind): Promise<UnitSourceView | null> =>
    source === "organisation" ? await sourceAt(unit, source, signed) : await sourceAt(unit, source, signed).catch(() => null);
  const sources = (await Promise.all(SOURCES.map(at))).filter((one): one is UnitSourceView => one !== null);

  if (sources.length === 0) throw fail(403, wording("org_agents.error.forbidden"));

  return {
    unit,
    sources,
    companyOpened: company && signed.administrator ? await companyOpened(unit, signed) : null,
    items: await itemsOf(event, unit)
  };
}

/** A source closed at the unit, or opened again to follow the link above, and its delegation set. A unit only closes
 * a source: opening one the links above close is theirs. */
export async function changeSource(unit: number, source: SourceKind, change: { closed?: boolean; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  const key = SOURCE_KINDS[source];
  const link = `unit:${unit}`;
  const caller = callerOf(signed);

  if (change.closed !== undefined) await setChainValue(key, link, change.closed ? false : null, caller);
  if (change.delegation !== undefined) await setChainDelegation(key, link, change.delegation, caller);
}

/** Organisation supply opened to a company or closed, by a rule naming it at the platform's link: the administrator's
 * alone. */
export async function openToCompany(company: number, opened: boolean, signed: SignedIn): Promise<void> {
  if (!signed.administrator) throw fail(403, wording("org_agents.error.forbidden"));

  const key = SOURCE_KINDS.organisation;
  const caller = callerOf(signed);
  const entry = await chainEntry(key, "platform", caller);
  const who = `unit:${company}`;
  const rules = entry.rules.filter((rule) => rule.who !== who);

  await setChainRules(key, "platform", opened ? [...rules, { who, value: true }] : rules, caller);
}

/** A key of the unit's added: its value kept in the unit's space of the secret store under its name, then named to
 * the agency for the road. */
export async function addKey(event: H3Event, unit: number, road: string, name: string, value: string, signed: SignedIn): Promise<void> {
  await keepUnitSecret(unit, name, value, callerOf(signed));
  await agencyCall(agency(event).POST("/organisation-supply/{unit}", { params: { path: { unit } }, body: { road, secret: name } }), { codes: CODES });
}

/** One of the unit's keys or accounts turned on or off. */
export async function switchKey(event: H3Event, unit: number, item: string, enabled: boolean): Promise<void> {
  await agencyCall(agency(event).PATCH("/organisation-supply/{unit}/{supplyId}", { params: { path: { unit, supplyId: item } }, body: { enabled } }), { codes: CODES });
}

/** One of the unit's keys or accounts taken away; the secret stays in the unit's space. */
export async function removeKey(event: H3Event, unit: number, item: string): Promise<void> {
  await agencyCall(agency(event).DELETE("/organisation-supply/{unit}/{supplyId}", { params: { path: { unit, supplyId: item } } }), { codes: CODES });
}

// A link's own composition value, as the agency writes it.
interface CompositionValue {
  roles?: Record<string, { off?: boolean; agents?: { provider?: unknown; model?: unknown; effort?: unknown }[] }>;
}

// One agent's road as a composition holds it, none for the road of the role's own agent.
function compositionRoad(said: { provider?: unknown; model?: unknown; effort?: unknown } | undefined): OwnRoad | null {
  if (typeof said?.provider !== "string" || typeof said.model !== "string") return null;

  return { provider: said.provider, model: said.model, effort: typeof said.effort === "string" ? said.effort : null };
}

// A role's word as a link's composition holds it.
function choiceOf(said: NonNullable<CompositionValue["roles"]>[string] | undefined): CompositionChoice | null {
  if (said === undefined) return null;
  if (said.off === true) return { off: true };
  if (Array.isArray(said.agents)) return { agents: said.agents.length, roads: said.agents.map(compositionRoad) };

  return null;
}

/** A unit's sign-up composition: what stands for each role there and the unit's own word on it. */
export async function unitComposition(event: H3Event, unit: number, signed: SignedIn): Promise<CompositionView> {
  const [stood, roles, entry, providers] = await Promise.all([
    agencyCall(agency(event).GET("/signup-composition", { params: { query: { unit } } }), { codes: CODES }),
    agencyCall(agency(event).GET("/roles"), { codes: CODES }),
    entryOrNone(COMPOSITION_KIND, `unit:${unit}`, signed),
    agencyCall(agency().GET("/providers")).then((page) => page.items)
  ]);

  if (entry === null) throw fail(403, wording("org_agents.error.forbidden"));

  const own = ((entry.value ?? {}) as CompositionValue).roles ?? {};
  const held = new Map(roles.roles.map((role) => [role.name, role]));

  return {
    unit,
    roles: stood.roles.map((role) => ({
      role: role.role,
      label: held.get(role.role)?.label ?? role.role,
      line: held.get(role.role)?.line ?? "",
      off: role.off,
      agents: role.agents === null || role.agents === undefined ? null : role.agents.length,
      own: choiceOf(own[role.role])
    })),
    // The unit's road chooser offers what the provider list carries; whose own switch or chain closes a provider is
    // each person's standing, which no unit-wide setting names here, so none stands marked off.
    providers: providers.filter((one) => one.enabled).map((one) => ({ name: one.name, label: one.label, lines: one.lines, off: null, offBy: null })),
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null,
    locker: await unitNamed(entry.lockedBy)
  };
}

/** The models a road of a unit's composition may name on one provider, for a reader who reads the unit's composition:
 * every model the provider offers, whether a person's supply carries it being each person's own. */
export async function compositionModels(unit: number, provider: string, signed: SignedIn): Promise<OwnModel[]> {
  if ((await entryOrNone(COMPOSITION_KIND, `unit:${unit}`, signed)) === null) throw fail(403, wording("org_agents.error.forbidden"));

  const read = await readProviderModels(provider);

  return read.models.map((one) => ({ id: one.id, efforts: one.efforts, inService: one.inService, supplied: true }));
}

/** A unit's word on one role written, none to follow above, and the composition's delegation set. The agency judges
 * and writes the composition whole on the chain in the reader's name. */
export async function changeComposition(event: H3Event, unit: number, change: { role?: string; choice?: CompositionChoice | null; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  if (change.role !== undefined) {
    const entry = await chainEntry(COMPOSITION_KIND, `unit:${unit}`, callerOf(signed));
    const roles = { ...(((entry.value ?? {}) as CompositionValue).roles ?? {}) };

    if (change.choice === null || change.choice === undefined) {
      delete roles[change.role];
    } else if ("off" in change.choice) {
      roles[change.role] = { off: true };
    } else {
      const roads = change.choice.roads;

      roles[change.role] = { agents: Array.from({ length: change.choice.agents }, (_, index) => {
        const road = roads[index] ?? null;

        return road === null ? {} : { provider: road.provider, model: road.model, ...(road.effort === null ? {} : { effort: road.effort }) };
      }) };
    }

    const value = Object.keys(roles).length === 0 ? null : { roles };

    // The agency judges the value against the roles it holds, and the console writes it on its own chain, which the
    // agency asks again when it next reads the composition.
    const judged = await agencyRoute<{ value: unknown }>("POST", "/signup-composition/judge", { value }, { codes: CODES });

    await setChainValue(COMPOSITION_KIND, `unit:${unit}`, judged.value, callerOf(signed));
  }

  if (change.delegation !== undefined) await setChainDelegation(COMPOSITION_KIND, `unit:${unit}`, change.delegation, callerOf(signed));
}
