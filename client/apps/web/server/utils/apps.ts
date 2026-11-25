import { spokenLanguage, wording, WORDING_LANGUAGE } from "#shared/wording";

import { AccountRefusal, chainEntry, chainKinds, homeUnit, resolveChain, setChainDelegation, setChainRules, setChainValue, unitView } from "./account-service";
import { appKind, appOfKind } from "./app-gate";
import { unitNamed } from "./chain-names";
import { recallSharedApp, sharedItems, turnOnSharedApp } from "./app-catalogue";
import { wordAt } from "./bundle-notices";
import { attachedService } from "./console-manifests";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";
import { ownerKeyOf } from "./owner-key";

import type { ChainEntryView, ChainKindView, ChainResolutionView, ProfileCaller } from "./account-service";
import type { SignedIn } from "./accounts";
import type { AppSetting } from "./app-gate";
import type { AppName, OwnApp, PlatformApp, PlatformAppChange, PlatformWord, UnitApp, UnitAppChange } from "#shared/apps";
import type { CatalogueApp } from "#shared/app-catalogue";

// The apps a reader turns on and off (docs/web.md, 「System and organisation」, the apps tab, and 「Settings」, the own apps
// section; docs/accounts.md, 「An app's two settings」): every app whose kinds the delegation chain holds, read and
// written on the chain's own routes as the signed-in login, so who writes a link and a lock above it are the account
// service's word. No app is named here: the chain's kinds name them, and a screen's bundle names their title.

/** The language the console reads a bundle's words in (docs/web.md, 「Screens a unit brings」): the reader's. */
function consoleLocale(): string {
  return spokenLanguage();
}

/** Every app whose kinds the chain holds, each with its kinds as their publisher declared them, by setting. */
export async function declaredAppKinds(): Promise<Map<string, Map<AppSetting, ChainKindView>>> {
  const apps = new Map<string, Map<AppSetting, ChainKindView>>();

  for (const kind of await chainKinds()) {
    const named = appOfKind(kind.key);

    if (named === null) continue;

    apps.set(named.app, (apps.get(named.app) ?? new Map()).set(named.setting, kind));
  }

  return apps;
}

/** Every app whose kinds the chain holds, each with the settings declared for it. */
export async function declaredApps(): Promise<Map<string, Set<AppSetting>>> {
  return new Map([...(await declaredAppKinds())].map(([app, kinds]) => [app, new Set(kinds.keys())]));
}

/** The company whose catalogue a shared app stands in, read off its key, `shared-<company>-…` (bmo-pocket's
 * `docs/catalogue.md`, 「The app on the delegation chain」); none for a platform app. */
export function sharedAppCompany(app: string): number | null {
  const company = /^shared-(\d+)-/.exec(app)?.[1];

  return company === undefined ? null : Number(company);
}

/** The apps a company's people and heads are shown: every platform app and their own company's shared apps, never
 * another company's (docs/accounts.md, 「An app's two settings」). A reader of no company is shown the platform's
 * alone. */
export function companyApps<T>(apps: ReadonlyMap<string, T>, company: number | null): Map<string, T> {
  return new Map([...apps].filter(([app]) => {
    const shared = sharedAppCompany(app);

    return shared === null || shared === company;
  }));
}

/** An app as its screen names it: the title its bundle's words give and its icon, or none where no screen of it is
 * attached. */
export function appName(app: string): AppName {
  const bundle = attachedService(app);
  const words = bundle?.words[consoleLocale()] ?? bundle?.words[WORDING_LANGUAGE];
  const title = bundle === null || words === undefined ? undefined : wordAt(words as Record<string, unknown>, bundle.manifest.title.split("."));

  return { app, title: typeof title === "string" && title !== "" ? title : null, icon: bundle?.manifest.icon ?? null };
}

/** The apps in the order of the names a reader reads them by. */
export function byName<T extends AppName>(apps: T[]): T[] {
  return apps.toSorted((one, other) => (one.title ?? one.app).localeCompare(other.title ?? other.app, consoleLocale()));
}

// Whether a resolution lets an app through: anything but `false` does.
function said(resolution: ChainResolutionView): boolean {
  return resolution.value !== false;
}

// A link's own word on an app: its value where it is a flag, none where it follows above.
function ownWord(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// A link's entry, or null where the reader may not read it.
async function entryOrNone(key: string, link: string, caller: ProfileCaller): Promise<ChainEntryView | null> {
  try {
    return await chainEntry(key, link, caller);
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 403) return null;

    throw error;
  }
}

// The link deciding an app for the reader from above them, where no word of theirs changes it: the link whose lock
// cuts their chain, or, for a kind whose person link only raises the value, the link that switched the app on and
// whose `true` they cannot take down (docs/accounts.md, 「An app's two settings」). None where the row is theirs.
function decideLink(kind: ChainKindView, ownLink: string, on: ChainResolutionView): string | null {
  const lockedBy = on.link?.lockedBy ?? null;

  if (lockedBy !== null) return lockedBy;

  const from = on.from ?? null;

  return kind.personRaises && on.value !== false && from !== null && from !== ownLink ? from : null;
}

/** The apps offered to the signed-in reader, each with what stands for them; none for a login with no user. */
export async function ownApps(signed: SignedIn): Promise<OwnApp[]> {
  const person = ownerKeyOf(signed);

  if (person === null) return [];

  const link = `person:${person}`;
  const [declared, home] = await Promise.all([declaredAppKinds(), homeUnit(person).catch(() => null)]);
  const apps = companyApps(declared, home?.company.id ?? null);
  const rows = await Promise.all(
    [...apps].map(async ([app, settings]): Promise<OwnApp | null> => {
      const onKind = settings.get("on");

      if (onKind === undefined) return null;

      const [offered, on] = await Promise.all([
        settings.has("offered") ? resolveChain(appKind(app, "offered"), { person }).then(said) : true,
        resolveChain(appKind(app, "on"), { person }, link)
      ]);

      if (!offered) return null;

      const stands = said(on);
      const decider = decideLink(onKind, link, on);

      return { ...appName(app), on: stands, own: on.from === link ? ownWord(on.value) : null, decided: await unitNamed(decider) };
    })
  );

  return byName(rows.filter((row): row is OwnApp => row !== null));
}

/** The signed-in reader's own word on an app written, null to follow their organisation. */
export async function setOwnApp(signed: SignedIn, app: string, on: boolean | null): Promise<void> {
  const person = ownerKeyOf(signed);

  if (person === null) throw fail(404, wording("apps.error.no_app"));

  const home = await homeUnit(person).catch(() => null);

  if (sharedAppCompany(app) !== null && sharedAppCompany(app) !== (home?.company.id ?? null)) throw fail(404, wording("apps.error.no_app"));

  await setChainValue(appKind(app, "on"), `person:${person}`, on, callerOf(signed));
}

/** Every app the chain holds as it stands for a unit, with what the reader may change of it there; the platform's
 * offer for the unit read for the administrator alone. */
export async function unitApps(unit: number, signed: SignedIn): Promise<UnitApp[]> {
  const caller = callerOf(signed);
  const link = `unit:${unit}`;
  const [declared, view] = await Promise.all([declaredApps(), unitView(unit)]);
  const apps = companyApps(declared, view.company.id);
  const items = [...apps.keys()].some((app) => sharedAppCompany(app) !== null) ? await sharedItems(signed, view.company.id) : new Map<string, CatalogueApp>();
  const rows = await Promise.all(
    [...apps].map(async ([app, settings]): Promise<UnitApp | null> => {
      if (!settings.has("on")) return null;

      const onKey = appKind(app, "on");
      const offerKey = appKind(app, "offered");
      const [offered, on, entry, platform] = await Promise.all([
        settings.has("offered") ? resolveChain(offerKey, { unit }).then(said) : true,
        resolveChain(onKey, { unit }, link),
        entryOrNone(onKey, link, caller),
        signed.administrator && settings.has("offered") ? chainEntry(offerKey, "platform", caller) : null
      ]);
      const lockedBy = on.link?.lockedBy ?? null;
      const lockedAbove = lockedBy !== null;
      const offer = signed.administrator ? { offer: ownWord(platform?.rules.find((rule) => rule.who === link)?.value) } : {};

      const item = items.get(app);
      const named = appName(app);

      return {
        ...named,
        // A shared item with no screen of its own is named by its title in the catalogue, in the console's language
        // where the item carries it.
        ...(named.title === null && item !== undefined ? { title: item.titles[consoleLocale()] ?? item.title } : {}),
        ...(item === undefined ? {} : { kind: item.kind }),
        offered,
        on: said(on),
        own: on.from === link ? ownWord(on.value) : null,
        locks: entry?.delegation === "lock",
        lockedAbove,
        locker: await unitNamed(lockedBy),
        writable: entry?.writable === true && !lockedAbove,
        shared: sharedAppCompany(app) !== null,
        ...offer
      };
    })
  );

  return byName(rows.filter((row): row is UnitApp => row !== null));
}

/** A unit's word on an app changed as the signed-in reader: its value, its lock, and the administrator's offer, each
 * where the change names it. */
export async function changeUnitApp(unit: number, app: string, change: UnitAppChange, signed: SignedIn): Promise<void> {
  const caller = callerOf(signed);
  const link = `unit:${unit}`;
  const onKey = appKind(app, "on");

  const shared = sharedAppCompany(app);
  const company = shared === null ? null : (await unitView(unit)).company.id;

  // Another company's shared app is no app of the unit's: it is never shown there, and never written there.
  if (shared !== null && shared !== company) throw fail(404, wording("apps.error.no_app"));

  if (change.offer !== undefined) {
    if (!signed.administrator) throw fail(403, wording("apps.error.forbidden"));

    const offerKey = appKind(app, "offered");
    const kept = (await chainEntry(offerKey, "platform", caller)).rules.filter((rule) => rule.who !== link);

    await setChainRules(offerKey, "platform", change.offer === null ? kept : [...kept, { who: link, value: change.offer }], caller);
  }

  // The company's own shared app turned on goes through the agency, which has every PC under the unit install a copy;
  // the lock it keeps is the one asked, else the one standing.
  if (company !== null && change.on === true) {
    const locks = change.locks ?? (await entryOrNone(onKey, link, caller))?.delegation === "lock";

    await turnOnSharedApp(signed, unit, company, app, locks);

    return;
  }

  if (change.on !== undefined) await setChainValue(onKey, link, change.on, caller);
  if (change.locks !== undefined) await setChainDelegation(onKey, link, change.locks ? "lock" : "inherit", caller);
}

/** The company's own shared app recalled at a unit through the agency (docs/web.md, 「System and organisation」, the apps tab). */
export async function recallUnitApp(unit: number, app: string, signed: SignedIn): Promise<void> {
  const shared = sharedAppCompany(app);

  if (shared === null || shared !== (await unitView(unit)).company.id) throw fail(404, wording("apps.error.no_app"));

  await recallSharedApp(signed, unit, shared, app);
}

// The platform's link, as the chain names it.
const PLATFORM = "platform";

// The platform's word on one setting: its own value where it says one, the declared default where it does not.
function platformWord(kind: ChainKindView, entry: ChainEntryView): PlatformWord {
  const declared = kind.default !== false;
  const own = ownWord(entry.value);

  return { value: own ?? declared, own, declared };
}

/** Every app the chain holds as it stands at the platform's own link, every company's shared apps among them: the
 * organisation screen's apps tab with the platform chosen, the administrator's alone. */
export async function platformApps(signed: SignedIn): Promise<PlatformApp[]> {
  if (!signed.administrator) throw fail(403, wording("apps.error.forbidden"));

  const caller = callerOf(signed);
  const listed = await Promise.all(
    [...(await declaredAppKinds())].map(async ([app, kinds]): Promise<PlatformApp | null> => {
      const onKind = kinds.get("on");
      const offerKind = kinds.get("offered");

      if (onKind === undefined) return null;

      const [on, offer] = await Promise.all([chainEntry(onKind.key, PLATFORM, caller), offerKind === undefined ? null : chainEntry(offerKind.key, PLATFORM, caller)]);

      return {
        ...appName(app),
        offered: offerKind === undefined || offer === null ? null : platformWord(offerKind, offer),
        on: platformWord(onKind, on),
        locks: on.delegation === "lock",
        recalled: recalled(on)
      };
    })
  );

  return byName(listed.filter((row): row is PlatformApp => row !== null));
}

// Whether the platform's link of an app's on recalls it: off under its own lock, with no rule turning it on for anyone.
function recalled(on: ChainEntryView): boolean {
  return on.delegation === "lock" && on.value === false && !on.rules.some((rule) => rule.value !== false);
}

/** The platform's own word on an app changed: whether it is offered and whether it is on, each where the change names
 * it, and its lock on the app's on. The administrator's alone. */
export async function changePlatformApp(app: string, change: PlatformAppChange, signed: SignedIn): Promise<void> {
  if (!signed.administrator) throw fail(403, wording("apps.error.forbidden"));

  const caller = callerOf(signed);

  if (change.offered !== undefined) await setChainValue(appKind(app, "offered"), PLATFORM, change.offered, caller);
  if (change.on !== undefined) await setChainValue(appKind(app, "on"), PLATFORM, change.on, caller);
  if (change.locks !== undefined) await setChainDelegation(appKind(app, "on"), PLATFORM, change.locks ? "lock" : "inherit", caller);
}

/** An app recalled: off at the platform under its lock, every platform rule turning it on for someone taken away, so
 * everything below is cut off it. What the links below hold stays kept and unread. The administrator's alone. */
export async function recallApp(app: string, signed: SignedIn): Promise<void> {
  if (!signed.administrator) throw fail(403, wording("apps.error.forbidden"));

  const caller = callerOf(signed);
  const key = appKind(app, "on");
  const entry = await chainEntry(key, PLATFORM, caller);
  const kept = entry.rules.filter((rule) => rule.value === false);

  await setChainValue(key, PLATFORM, false, caller);
  if (kept.length !== entry.rules.length) await setChainRules(key, PLATFORM, kept, caller);
  await setChainDelegation(key, PLATFORM, "lock", caller);
}

/** A recall lifted: the platform's lock on the app's on taken away and its own word with it, so its publisher's
 * declaration and every link below stand again. The administrator's alone. */
export async function liftRecall(app: string, signed: SignedIn): Promise<void> {
  if (!signed.administrator) throw fail(403, wording("apps.error.forbidden"));

  const caller = callerOf(signed);
  const key = appKind(app, "on");

  await setChainDelegation(key, PLATFORM, "inherit", caller);
  await setChainValue(key, PLATFORM, null, caller);
}

// The account service's refusals of an app's link, in the pack's words.
const APP_CODES: Readonly<Record<string, string>> = {
  locked: "apps.error.locked",
  forbidden: "apps.error.forbidden",
  "no-such-kind": "apps.error.no_app",
  "bad-value": "apps.error.failed",
  "bad-link": "apps.error.failed"
};

/** What a call on an app's link came to, said in the pack's words. */
export function appsFailure(error: unknown): Error {
  return organizationFailure(error, APP_CODES);
}

/** An app's key from a route's path, refused where it names none an app can carry. */
export function appParam(raw: string | undefined): string {
  if (raw === undefined || appOfKind(appKind(raw, "on")) === null) throw fail(400, wording("apps.error.no_app"));

  return raw;
}

/** A word on an app as a body carries it: true, false or null; refused where it is none of them. */
export function appWord(value: unknown): boolean | null {
  if (value === null || typeof value === "boolean") return value;

  throw fail(400, wording("organization.error.bad_request"));
}
