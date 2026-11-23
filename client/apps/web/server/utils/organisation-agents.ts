import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, resolveChain, setChainDelegation, setChainValue, unitView } from "./account-service";
import { agency, agencyCall } from "./agency";
import { fail } from "./fail";
import { callerOf } from "./organization";
import { ownerKeyOf } from "./owner-key";

import type { ChainEntryView, ChainResolutionView } from "./account-service";
import type { SignedIn } from "./accounts";
import type { AgentSettingKey, DecidedBy, OwnPersona, OwnSupplySource, PersonaChoice, UnitAgentSettings, UnitChainSetting, UnitInstructions, UnitRepository } from "#shared/organisation-agents";
import type { ChainDelegation, SourceKind } from "#shared/organisation-supply";
import type { H3Event } from "h3";

// An organisation's agent settings (docs/web.md, 「Organisation」, the agents tab; the agency's
// `docs/prompt-layers.md`, `docs/repositories.md` and `docs/role-agents.md`): the organisation's instructions, the
// persona's choice, repository management and what its people may change of the agents it supplies are the agency's
// kinds on the delegation chain, read and written on the chain's own routes as
// the signed-in login, so who writes a link and a lock above it are the account service's word. A unit's own
// repositories are the agency's rows, added and removed as the signed-in login. And the settings of the chain a person
// reads in their own settings (「Settings」): the supply sources standing for them, and their persona's choice, a unit
// above deciding them named.

/** The chain's kind of each agents-tab setting, as the agency declares it. */
const KINDS: Readonly<Record<AgentSettingKey, string>> = {
  instructions: "agency.org-instructions",
  persona: "agency.persona",
  repositories: "repositories.manage",
  ownAgents: "agency.own-agents",
  roadChoice: "agency.road-choice",
  personalInstructions: "agency.personal-instructions"
};

/** The chain's kind of each supply source, as the agency declares it. */
const SOURCE_KINDS: Readonly<Record<SourceKind, string>> = {
  personal: "supply.personal",
  organisation: "supply.organisation",
  platform: "supply.platform"
};

const SOURCES: readonly SourceKind[] = ["personal", "organisation", "platform"];

// The codes the agency answers a repository's add and removal with, each with the pack's key for its sentence.
const REPOSITORY_CODES: Readonly<Record<string, string>> = {
  "repositories-withheld": "org_agents.error.repositories_withheld",
  forbidden: "org_agents.error.forbidden",
  "access-unchecked": "org_agents.error.unchecked"
};

// The fields of an add the agency may refuse, each with the pack's key for what the form says under it.
const REPOSITORY_FIELDS: Readonly<Record<string, string>> = { name: "org_agents.error.repository_name", path: "org_agents.error.repository_path" };

const SETTINGS: readonly AgentSettingKey[] = ["instructions", "persona", "repositories", "ownAgents", "roadChoice", "personalInstructions"];

/** Whether a word names an agents-tab setting. */
export function isAgentSetting(value: unknown): value is AgentSettingKey {
  return typeof value === "string" && (SETTINGS as readonly string[]).includes(value);
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

// A persona's choice as a keys value holds it: none where it names `none`, the agent's own otherwise.
function personaOf(value: unknown): PersonaChoice | null {
  if (!Array.isArray(value)) return null;

  return value.includes("none") ? "none" : value.includes("own") ? "own" : null;
}

function flagOf(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function settingOf<Value>(entry: ChainEntryView, own: Value | null, stands: Value): UnitChainSetting<Value> {
  return { own, stands, delegation: entry.delegation, writable: entry.writable, lockedBy: entry.lockedBy ?? null };
}

async function instructionsAt(unit: number, signed: SignedIn): Promise<UnitInstructions | null> {
  const link = `unit:${unit}`;
  const [entry, resolved] = await Promise.all([entryOrNone(KINDS.instructions, link, signed), resolveChain(KINDS.instructions, { unit })]);

  if (entry === null) return null;

  const above = resolved.layers.filter((layer) => layer.link !== link).flatMap((layer) => (textOf(layer.value) === null ? [] : [String(layer.value)]));

  return { own: textOf(entry.value), above, delegation: entry.delegation, writable: entry.writable, lockedBy: entry.lockedBy ?? null };
}

async function personaAt(unit: number, signed: SignedIn): Promise<UnitChainSetting<PersonaChoice> | null> {
  const [entry, resolved] = await Promise.all([entryOrNone(KINDS.persona, `unit:${unit}`, signed), resolveChain(KINDS.persona, { unit })]);

  return entry === null ? null : settingOf(entry, personaOf(entry.value), personaOf(resolved.value) ?? "own");
}

// A flag of the unit's, allowed where nothing says otherwise; none where the reader may not read it, or where the unit
// that declares it has not declared it yet, so the tab stands without it.
async function flagAt(setting: AgentSettingKey, unit: number, signed: SignedIn): Promise<UnitChainSetting<boolean> | null> {
  try {
    const [entry, resolved] = await Promise.all([entryOrNone(KINDS[setting], `unit:${unit}`, signed), resolveChain(KINDS[setting], { unit })]);

    return entry === null ? null : settingOf(entry, flagOf(entry.value), resolved.value !== false);
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 404) return null;

    throw error;
  }
}

/** The agent settings of a unit as the reader stands to them; a reader who writes none of them is refused. */
export async function unitAgentSettings(unit: number, signed: SignedIn): Promise<UnitAgentSettings> {
  const [instructions, persona, repositories, ownAgents, roadChoice, personalInstructions] = await Promise.all([
    instructionsAt(unit, signed),
    personaAt(unit, signed),
    flagAt("repositories", unit, signed),
    flagAt("ownAgents", unit, signed),
    flagAt("roadChoice", unit, signed),
    flagAt("personalInstructions", unit, signed)
  ]);

  if ([instructions, persona, repositories, ownAgents, roadChoice, personalInstructions].every((one) => one === null)) throw fail(403, wording("org_agents.error.forbidden"));

  return { unit, instructions, persona, repositories, ownAgents, roadChoice, personalInstructions };
}

/** The chain's value of a setting as the screen sends it: undefined where it is none of the setting's, null to follow
 * above. */
export function settingValue(setting: AgentSettingKey, value: unknown): unknown {
  if (value === null) return null;
  if (setting === "instructions") return typeof value === "string" ? (value.trim() === "" ? null : value) : undefined;
  if (setting === "persona") return value === "own" || value === "none" ? [value] : undefined;

  return typeof value === "boolean" ? value : undefined;
}

/** A unit's word on one setting written, null to follow above, and its delegation set. */
export async function changeAgentSetting(unit: number, setting: AgentSettingKey, change: { value?: unknown; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  const link = `unit:${unit}`;
  const caller = callerOf(signed);

  if (change.value !== undefined) await setChainValue(KINDS[setting], link, change.value, caller);
  if (change.delegation !== undefined) await setChainDelegation(KINDS[setting], link, change.delegation, caller);
}

/** The repositories a unit owns, for a reader the chain answers the unit's link of repository management to: its
 * heads and the administrator. The agency's list is read as the deployment's own, since a head need hold no part of
 * agent management to read their unit's. */
export async function unitRepositories(unit: number, signed: SignedIn): Promise<UnitRepository[]> {
  if ((await entryOrNone(KINDS.repositories, `unit:${unit}`, signed)) === null) throw fail(403, wording("org_agents.error.forbidden"));

  const list = await agencyCall(agency().GET("/repositories"), {});

  return list.items.filter((one) => one.ownerUnit === unit).map((one) => ({ name: one.name, label: one.label, path: one.path }));
}

/** A repository added under the unit, in the reader's name: the agency judges whether they head it and may. */
export async function addUnitRepository(event: H3Event, unit: number, ask: { name: string; label: string | null; path: string }): Promise<void> {
  await agencyCall(agency(event).POST("/repositories", { body: { name: ask.name, label: ask.label, path: ask.path, ownerUnit: unit } }), { codes: REPOSITORY_CODES, fields: REPOSITORY_FIELDS });
}

/** A repository of the unit's removed, in the reader's name. */
export async function removeUnitRepository(event: H3Event, unit: number, name: string, signed: SignedIn): Promise<void> {
  const held = (await unitRepositories(unit, signed)).some((one) => one.name === name);

  if (!held) throw fail(404, wording("agents.error.agency_not_found"));

  await agencyCall(agency(event).DELETE("/repositories/{repositoryName}", { params: { path: { repositoryName: name } } }), { codes: REPOSITORY_CODES });
}

// --- A person's own reading of the chain ---

/** Who a link of the chain is, as a person's settings name it: a unit by its name, the platform, or nobody where it
 * names none. */
export async function unitNamed(link: string | null | undefined): Promise<DecidedBy> {
  if (link === null || link === undefined) return null;
  if (link === "platform") return { by: "platform" };

  const unit = /^unit:(\d+)$/.exec(link)?.[1];

  if (unit === undefined) return { by: "unit", name: null };

  return { by: "unit", name: await unitView(Number(unit)).then((one) => one.name, () => null) };
}

// Who closed a source that narrows down the chain: the outermost link whose word is off, else the lock over the
// reader's own link.
async function closer(resolved: ChainResolutionView): Promise<DecidedBy> {
  const closed = resolved.layers.find((layer) => layer.value === false);

  return await unitNamed(closed?.link ?? resolved.link?.lockedBy);
}

/** The three supply sources as they stand for the signed-in reader, each with who decided it where anybody did. */
export async function ownSupplySources(signed: SignedIn): Promise<OwnSupplySource[]> {
  const person = ownerKeyOf(signed);

  if (person === null) return [];

  return await Promise.all(
    SOURCES.map(async (source): Promise<OwnSupplySource> => {
      const resolved = await resolveChain(SOURCE_KINDS[source], { person }, `person:${person}`);

      if (source === "organisation") {
        const provided = resolved.layers.some((layer) => layer.link === "platform" && layer.value === true);
        const on = provided && resolved.value === true;

        return { source, on, decided: on ? null : provided ? await closer(resolved) : { by: "platform" } };
      }

      const on = resolved.value !== false;

      return { source, on, decided: on && (resolved.link?.lockedBy ?? null) === null ? null : await closer(resolved) };
    })
  );
}

/** The persona's choice as it stands for the signed-in reader, with the unit whose lock decides it where one does. */
export async function ownPersona(signed: SignedIn): Promise<OwnPersona> {
  const person = ownerKeyOf(signed);

  if (person === null) throw fail(404, wording("bmo_profile.error.read_failed"));

  const link = `person:${person}`;
  const resolved = await resolveChain(KINDS.persona, { person }, link);
  const lockedBy = resolved.link?.lockedBy ?? null;
  const own = resolved.from === link && lockedBy === null ? personaOf(resolved.value) : null;

  return { on: (personaOf(resolved.value) ?? "own") === "own", own: own === null ? null : own === "own", decided: lockedBy === null ? null : await unitNamed(lockedBy) };
}

/** The signed-in reader's own word on their persona written, null to follow their organisation. A lock above refuses
 * it at the account service. */
export async function setOwnPersona(signed: SignedIn, on: boolean | null): Promise<void> {
  const person = ownerKeyOf(signed);

  if (person === null) throw fail(404, wording("bmo_profile.error.read_failed"));

  await setChainValue(KINDS.persona, `person:${person}`, on === null ? null : [on ? "own" : "none"], callerOf(signed));
}
