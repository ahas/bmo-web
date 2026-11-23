import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, keepUnitSecret, resolveChain, setChainDelegation, setChainRules, setChainValue } from "./account-service";
import { agency, agencyCall } from "./agency";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";

import type { ChainEntryView } from "./account-service";
import type { SignedIn } from "./accounts";
import type { ChainDelegation, CompositionChoice, CompositionView, SourceKind, UnitSourceView, UnitSupplyItem, UnitSupplyView } from "#shared/organisation-supply";
import type { H3Event } from "h3";

// An organisation's agents (docs/web.md, 「Organisation」, the agents tab; the agency's `docs/supply.md`,
// 「The sources a person's chain leaves open」 and 「Organisation supply」, and `docs/role-agents.md`, 「The agents an
// account is given」): the three source settings and the sign-up composition are the agency's kinds on the
// delegation chain, read and written on the chain's own routes as the signed-in login, so who writes a link and a
// lock above it are the account service's word; a unit's own keys and its composition are the agency's, asked as the
// signed-in login. A key's value goes from the form into the unit's space of the secret store and nowhere else.

/** The chain's kind of each source, as the agency declares it. */
const SOURCE_KINDS: Readonly<Record<SourceKind, string>> = {
  personal: "supply.personal",
  organisation: "supply.organisation",
  platform: "supply.platform"
};

/** The sources in the order a run takes them. */
export const SOURCES: readonly SourceKind[] = ["personal", "organisation", "platform"];

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

  const stands = source === "organisation" ? organisationOpen(resolved.layers, resolved.value) : resolved.value !== false;

  return {
    source,
    stands,
    closedHere: entry.value === false,
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null
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
  const sources = (await Promise.all(SOURCES.map((source) => sourceAt(unit, source, signed)))).filter((one): one is UnitSourceView => one !== null);

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
  roles?: Record<string, { off?: boolean; agents?: unknown[] }>;
}

// A role's word as a link's composition holds it.
function choiceOf(said: { off?: boolean; agents?: unknown[] } | undefined): CompositionChoice | null {
  if (said === undefined) return null;
  if (said.off === true) return { off: true };
  if (Array.isArray(said.agents)) return { agents: said.agents.length };

  return null;
}

/** A unit's sign-up composition: what stands for each role there and the unit's own word on it. */
export async function unitComposition(event: H3Event, unit: number, signed: SignedIn): Promise<CompositionView> {
  const [stood, roles, entry] = await Promise.all([
    agencyCall(agency(event).GET("/signup-composition", { params: { query: { unit } } }), { codes: CODES }),
    agencyCall(agency(event).GET("/roles"), { codes: CODES }),
    entryOrNone(COMPOSITION_KIND, `unit:${unit}`, signed)
  ]);

  if (entry === null) throw fail(403, wording("org_agents.error.forbidden"));

  const own = ((entry.value ?? {}) as CompositionValue).roles ?? {};
  const labels = new Map(roles.roles.map((role) => [role.name, role.label]));

  return {
    unit,
    roles: stood.roles.map((role) => ({
      role: role.role,
      label: labels.get(role.role) ?? role.role,
      off: role.off,
      agents: role.agents === null || role.agents === undefined ? null : role.agents.length,
      own: choiceOf(own[role.role])
    })),
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null
  };
}

/** A unit's word on one role written, none to follow above, and the composition's delegation set. The agency judges
 * and writes the composition whole on the chain in the reader's name. */
export async function changeComposition(event: H3Event, unit: number, change: { role?: string; choice?: CompositionChoice | null; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  if (change.role !== undefined) {
    const entry = await chainEntry(COMPOSITION_KIND, `unit:${unit}`, callerOf(signed));
    const roles = { ...(((entry.value ?? {}) as CompositionValue).roles ?? {}) };

    if (change.choice === null || change.choice === undefined) {
      delete roles[change.role];
    } else {
      roles[change.role] = "off" in change.choice ? { off: true } : { agents: Array.from({ length: change.choice.agents }, () => ({})) };
    }

    const value = Object.keys(roles).length === 0 ? null : { roles };

    await agencyCall(agency(event).PUT("/signup-composition/{link}", { params: { path: { link: `unit:${unit}` } }, body: { value } }), { codes: CODES });
  }

  if (change.delegation !== undefined) await setChainDelegation(COMPOSITION_KIND, `unit:${unit}`, change.delegation, callerOf(signed));
}
