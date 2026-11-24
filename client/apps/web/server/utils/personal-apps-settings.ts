import { wording } from "#shared/wording";
import { PERSONAL_APP_SETTINGS } from "#shared/personal-apps-settings";

import { AccountRefusal, chainEntry, resolveChain, setChainDelegation, setChainRules, setChainValue } from "./account-service";
import { unitNamed } from "./chain-names";
import { fail } from "./fail";
import { callerOf } from "./organization";

import type { ChainEntryView } from "./account-service";
import type { SignedIn } from "./accounts";
import type { AgentsLink } from "./organisation-agents";
import type { ChainDelegation } from "#shared/organisation-supply";
import type { PersonalAppSetting, PersonalAppSettings, PersonalAppSettingView, ShareScope } from "#shared/personal-apps-settings";

// The personal app settings of a link (docs/web.md, 「Organisation」, the apps tab): the agency's kinds on the
// delegation chain, read and written on the chain's own routes as the signed-in login, so who writes a link and a
// lock above it are the account service's word. Network and secrets stay off until the platform opens them for a
// company, by a rule naming it at the platform's link, which the administrator writes on the company's row.

/** Each setting's kind as the agency declares it, its default where nothing is said, and whether the platform opens
 * it one company at a time. */
const KINDS: Readonly<Record<PersonalAppSetting, { key: string; fallback: boolean | ShareScope[]; perCompany: boolean }>> = {
  make: { key: "personal-apps.make", fallback: true, perCompany: false },
  network: { key: "personal-apps.network", fallback: false, perCompany: true },
  secrets: { key: "personal-apps.secrets", fallback: false, perCompany: true },
  shareScope: { key: "personal-apps.share-scope", fallback: ["team", "heads"], perCompany: false },
  shareReview: { key: "personal-apps.share-review", fallback: false, perCompany: false },
  install: { key: "personal-apps.install", fallback: true, perCompany: false }
};

const SCOPES: readonly ShareScope[] = ["team", "heads", "company"];

/** Whether a word names a personal app setting. */
export function isPersonalAppSetting(value: unknown): value is PersonalAppSetting {
  return typeof value === "string" && (PERSONAL_APP_SETTINGS as readonly string[]).includes(value);
}

/** The chain's value of a setting as the screen sends it: undefined where it is none of the setting's, null to follow
 * above. */
export function personalAppValue(setting: PersonalAppSetting, value: unknown): unknown {
  if (value === null) return null;
  if (setting === "shareScope") return Array.isArray(value) && value.every((one) => (SCOPES as readonly unknown[]).includes(one)) ? SCOPES.filter((one) => value.includes(one)) : undefined;

  return typeof value === "boolean" ? value : undefined;
}

function wordOf(setting: PersonalAppSetting, value: unknown): boolean | ShareScope[] | null {
  if (setting === "shareScope") return Array.isArray(value) ? SCOPES.filter((one) => value.includes(one)) : null;

  return typeof value === "boolean" ? value : null;
}

function linkWord(at: AgentsLink): string {
  return at === "platform" ? "platform" : `unit:${at.unit}`;
}

async function entryOrNone(key: string, link: string, signed: SignedIn): Promise<ChainEntryView | null> {
  try {
    return await chainEntry(key, link, callerOf(signed));
  } catch (error) {
    if (error instanceof AccountRefusal && (error.status === 403 || error.status === 404)) return null;

    throw error;
  }
}

async function settingAt(setting: PersonalAppSetting, at: AgentsLink, company: boolean, signed: SignedIn): Promise<PersonalAppSettingView | null> {
  const { key, fallback, perCompany } = KINDS[setting];
  const entry = await entryOrNone(key, linkWord(at), signed);

  if (entry === null) return null;

  const resolved = at === "platform" ? null : await resolveChain(key, { unit: at.unit });
  const stands = wordOf(setting, resolved === null ? entry.value : resolved.value) ?? fallback;
  let offered: boolean | null = null;

  if (perCompany && company && at !== "platform" && signed.administrator) {
    const platform = await entryOrNone(key, "platform", signed);

    offered = platform?.rules.some((rule) => rule.who === `unit:${at.unit}` && rule.value === true) ?? false;
  }

  return { setting, own: wordOf(setting, entry.value), stands, delegation: entry.delegation, writable: entry.writable, lockedBy: entry.lockedBy ?? null, locker: await unitNamed(entry.lockedBy), offered };
}

/** The personal app settings of a link as the reader stands to them; `company` says a unit is a company. A reader who
 * writes none of them is refused. */
export async function personalAppSettings(at: AgentsLink, company: boolean, signed: SignedIn): Promise<PersonalAppSettings> {
  const settings = (await Promise.all(PERSONAL_APP_SETTINGS.map((setting) => settingAt(setting, at, company, signed)))).filter((one): one is PersonalAppSettingView => one !== null);

  if (settings.length === 0) throw fail(403, wording("org_agents.error.forbidden"));

  return { settings };
}

/** A link's word on one setting written, null to follow above, its delegation set, and for the administrator on a
 * company the platform's rule opening a setting to it. */
export async function changePersonalApp(at: AgentsLink, setting: PersonalAppSetting, change: { value?: unknown; delegation?: ChainDelegation; offered?: boolean }, signed: SignedIn): Promise<void> {
  const { key, perCompany } = KINDS[setting];
  const link = linkWord(at);
  const caller = callerOf(signed);

  if (change.value !== undefined) await setChainValue(key, link, change.value, caller);
  if (change.delegation !== undefined) await setChainDelegation(key, link, change.delegation, caller);
  if (change.offered !== undefined) {
    if (!signed.administrator || !perCompany || at === "platform") throw fail(403, wording("org_agents.error.forbidden"));

    const entry = await chainEntry(key, "platform", caller);
    const who = `unit:${at.unit}`;
    const rules = entry.rules.filter((rule) => rule.who !== who);

    await setChainRules(key, "platform", change.offered ? [...rules, { who, value: true }] : rules, caller);
  }
}
