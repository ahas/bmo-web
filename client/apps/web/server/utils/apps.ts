import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, chainKinds, resolveChain, setChainDelegation, setChainRules, setChainValue } from "./account-service";
import { appKind, appOfKind } from "./app-gate";
import { wordAt } from "./bundle-notices";
import { attachedService } from "./console-manifests";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";
import { ownerKeyOf } from "./owner-key";

import type { ChainEntryView, ChainResolutionView, ProfileCaller } from "./account-service";
import type { SignedIn } from "./accounts";
import type { AppSetting } from "./app-gate";
import type { AppName, OwnApp, UnitApp, UnitAppChange } from "#shared/apps";

// The apps a reader turns on and off (docs/web.md, 「Organisation」, the apps tab, and 「Settings」, the own apps
// section; docs/accounts.md, 「An app's two settings」): every app whose kinds the delegation chain holds, read and
// written on the chain's own routes as the signed-in login, so who writes a link and a lock above it are the account
// service's word. No app is named here: the chain's kinds name them, and a screen's bundle names their title.

/** The language the console reads a bundle's words in (docs/web.md, 「Screens a unit brings」). */
const CONSOLE_LOCALE = "ko";

/** Every app whose kinds the chain holds, each with the settings declared for it. */
export async function declaredApps(): Promise<Map<string, Set<AppSetting>>> {
  const apps = new Map<string, Set<AppSetting>>();

  for (const kind of await chainKinds()) {
    const named = appOfKind(kind.key);

    if (named === null) continue;

    apps.set(named.app, (apps.get(named.app) ?? new Set()).add(named.setting));
  }

  return apps;
}

/** An app as its screen names it: the title its bundle's words give and its icon, or none where no screen of it is
 * attached. */
export function appName(app: string): AppName {
  const bundle = attachedService(app);
  const words = bundle?.words[CONSOLE_LOCALE];
  const title = bundle === null || words === undefined ? undefined : wordAt(words as Record<string, unknown>, bundle.manifest.title.split("."));

  return { app, title: typeof title === "string" && title !== "" ? title : null, icon: bundle?.manifest.icon ?? null };
}

/** The apps in the order of the names a reader reads them by. */
export function byName<T extends AppName>(apps: T[]): T[] {
  return apps.toSorted((one, other) => (one.title ?? one.app).localeCompare(other.title ?? other.app, CONSOLE_LOCALE));
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

/** The apps offered to the signed-in reader, each with what stands for them; none for a login with no user. */
export async function ownApps(signed: SignedIn): Promise<OwnApp[]> {
  const person = ownerKeyOf(signed);

  if (person === null) return [];

  const link = `person:${person}`;
  const apps = await declaredApps();
  const rows = await Promise.all(
    [...apps].map(async ([app, settings]): Promise<OwnApp | null> => {
      if (!settings.has("on")) return null;

      const [offered, on] = await Promise.all([
        settings.has("offered") ? resolveChain(appKind(app, "offered"), { person }).then(said) : true,
        resolveChain(appKind(app, "on"), { person }, link)
      ]);

      if (!offered) return null;

      return { ...appName(app), on: said(on), own: on.from === link ? ownWord(on.value) : null, locked: (on.link?.lockedBy ?? null) !== null };
    })
  );

  return byName(rows.filter((row): row is OwnApp => row !== null));
}

/** The signed-in reader's own word on an app written, null to follow their organisation. */
export async function setOwnApp(signed: SignedIn, app: string, on: boolean | null): Promise<void> {
  const person = ownerKeyOf(signed);

  if (person === null) throw fail(404, wording("apps.error.no_app"));

  await setChainValue(appKind(app, "on"), `person:${person}`, on, callerOf(signed));
}

/** Every app the chain holds as it stands for a unit, with what the reader may change of it there; the platform's
 * offer for the unit read for the administrator alone. */
export async function unitApps(unit: number, signed: SignedIn): Promise<UnitApp[]> {
  const caller = callerOf(signed);
  const link = `unit:${unit}`;
  const apps = await declaredApps();
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
      const lockedAbove = (on.link?.lockedBy ?? null) !== null;
      const offer = signed.administrator ? { offer: ownWord(platform?.rules.find((rule) => rule.who === link)?.value) } : {};

      return {
        ...appName(app),
        offered,
        on: said(on),
        own: on.from === link ? ownWord(on.value) : null,
        locks: entry?.delegation === "lock",
        lockedAbove,
        writable: entry?.writable === true && !lockedAbove,
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

  if (change.offer !== undefined) {
    if (!signed.administrator) throw fail(403, wording("apps.error.forbidden"));

    const offerKey = appKind(app, "offered");
    const kept = (await chainEntry(offerKey, "platform", caller)).rules.filter((rule) => rule.who !== link);

    await setChainRules(offerKey, "platform", change.offer === null ? kept : [...kept, { who: link, value: change.offer }], caller);
  }

  if (change.on !== undefined) await setChainValue(onKey, link, change.on, caller);
  if (change.locks !== undefined) await setChainDelegation(onKey, link, change.locks ? "lock" : "inherit", caller);
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
