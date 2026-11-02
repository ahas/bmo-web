import { CONSOLE_MANIFEST_ROUTE, consoleManifest, relaysRoute, roleAllows, screensCall } from "bmo-ui/shared/console-manifest";

import { ownerKeyOf, ownerRoleOf } from "./owner-key";
import { unitHeaders } from "./units";

import type { SignedIn } from "./accounts";
import type { UnitAddress } from "./units";
import type { ConsoleScreen } from "#shared/console-bundles";
import type { ConsoleManifest, ConsoleRole, ConsoleWords } from "bmo-ui/shared/console-manifest";

// The console bundles the units bring (docs/web.md, 「Screens a unit brings」; bmo-ui's `docs/console-bundles.md`):
// every unit the settings name is asked for its manifest, and a unit whose manifest reads brings its bundle, its
// words and its relay. The list is the console's own and names no unit; a unit is whatever its manifest says.

/** One bundle attached: the manifest as it reads, the unit that answered it, and the bundle's words. */
export interface AttachedBundle {
  manifest: ConsoleManifest;
  unit: UnitAddress;
  words: ConsoleWords;
}

// Each unit's bundle as its last answer brought it, and the units whose ask is still out. An ask waits for its
// unit's answer, so a unit still answering keeps what it last brought and is not asked again until it has
// answered, and no unit taking its time holds up another's screens.
const brought = new Map<string, AttachedBundle | null>();
const asking = new Set<string>();

let attached: readonly AttachedBundle[] = [];
const listeners = new Set<(bundles: readonly AttachedBundle[]) => void>();

/** The bundles attached as the manifests last read. */
export function attachedBundles(): readonly AttachedBundle[] {
  return attached;
}

/** The bundle relayed under a service name, or null where no manifest names it. */
export function attachedService(serviceName: string): AttachedBundle | null {
  return attached.find((bundle) => bundle.manifest.serviceName === serviceName) ?? null;
}

/** Stands a list of bundles as the attached ones, telling everyone who listens. */
export function attachBundles(bundles: readonly AttachedBundle[]): void {
  attached = bundles;

  for (const listener of listeners) listener(bundles);
}

/** Hears every reading of the manifests, the first included once it is made. */
export function onBundlesRead(listener: (bundles: readonly AttachedBundle[]) => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** Every unit the settings name, as `<NAME>_ADDRESS` with an address set, with its token. */
export function namedUnits(environment: Record<string, string | undefined> = process.env): { name: string; unit: UnitAddress }[] {
  const named: { name: string; unit: UnitAddress }[] = [];

  for (const [key, value] of Object.entries(environment)) {
    const name = /^([A-Z][A-Z0-9_]*)_ADDRESS$/.exec(key)?.[1];
    const address = value?.trim() ?? "";

    if (name === undefined || address === "") continue;

    const token = environment[`${name}_TOKEN`]?.trim() ?? "";

    named.push({ name, unit: { address: address.replace(/\/+$/, ""), token: token === "" ? null : token } });
  }

  return named;
}

async function answered(unit: UnitAddress, path: string): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${unit.address}${path}`, { headers: { ...unitHeaders(unit), accept: "application/json" } });
  } catch {
    return undefined;
  }

  if (response.status !== 200) return undefined;

  return response.json().catch(() => undefined);
}

/** One unit's bundle, or null where it answers none, its manifest does not read or its words do not answer. */
export async function askedBundle(name: string, unit: UnitAddress): Promise<AttachedBundle | null> {
  const value = await answered(unit, CONSOLE_MANIFEST_ROUTE);

  if (value === undefined) return null;

  let manifest: ConsoleManifest;

  try {
    manifest = consoleManifest(value);
  } catch (error) {
    console.error(`console bundles: ${name}'s manifest is left out: ${(error as Error).message}`);

    return null;
  }

  const words = await answered(unit, manifest.words);

  if (typeof words !== "object" || words === null || Array.isArray(words)) {
    console.error(`console bundles: ${name}'s words do not answer at ${manifest.words}; its bundle is left out`);

    return null;
  }

  return { manifest, unit, words: words as ConsoleWords };
}

/** The bundles with every two that share a name, a screen path or a service name left out, both of them. */
export function withoutConflicts(found: readonly AttachedBundle[]): AttachedBundle[] {
  const clash = (one: ConsoleManifest, other: ConsoleManifest) =>
    one.name === other.name || one.screenPath === other.screenPath || one.serviceName === other.serviceName;

  return found.filter((bundle) => {
    const others = found.filter((other) => other !== bundle && clash(bundle.manifest, other.manifest));

    if (others.length > 0) console.error(`console bundles: ${bundle.manifest.name} shares its name, screen or service with another; both are left out`);

    return others.length === 0;
  });
}

/**
 * Asks every unit the settings name for its manifest, but one whose last ask is still out, and stands what reads
 * as the attached bundles each time a unit answers; settles once every ask it made has.
 */
export async function readManifests(environment: Record<string, string | undefined> = process.env): Promise<readonly AttachedBundle[]> {
  const units = namedUnits(environment);
  const named = new Set(units.map(({ name }) => name));

  for (const name of [...brought.keys()]) {
    if (!named.has(name)) brought.delete(name);
  }

  const stand = () => attachBundles(withoutConflicts([...brought.values()].filter((bundle): bundle is AttachedBundle => bundle !== null)));

  await Promise.all(
    units
      .filter(({ name }) => !asking.has(name))
      .map(async ({ name, unit }) => {
        asking.add(name);

        try {
          brought.set(name, await askedBundle(name, unit));
        } finally {
          asking.delete(name);
        }

        stand();
      })
  );
  stand();

  return attached;
}

/** What a reader holds, as a bundle's role and owner key are read against it. */
export interface Reader {
  role: ConsoleRole;
  // Whether the login has a user, whose id is the owner key.
  keyed: boolean;
}

/** What a signed-in login holds as a reader. */
export function readerOf(signed: SignedIn): Reader {
  return { role: ownerRoleOf(signed), keyed: ownerKeyOf(signed) !== null };
}

/** Whether a reader may open a bundle's screen: their role allows the manifest's, and they carry a key where it asks one. */
export function readerMay(reader: Reader, manifest: ConsoleManifest): boolean {
  return roleAllows(reader.role, manifest.role) && (!manifest.ownerKey || reader.keyed);
}

/** The relay address of a path of a service's API, under the console's base path and relay base. */
export function relayPath(baseURL: string, manifest: ConsoleManifest, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}/api/${manifest.serviceName}${path}`;
}

/** A bundle as a browser is handed it. */
export function screenOf(bundle: AttachedBundle, baseURL: string): ConsoleScreen {
  const { manifest } = bundle;

  return {
    name: manifest.name,
    title: manifest.title,
    icon: manifest.icon,
    screenPath: manifest.screenPath,
    role: manifest.role,
    module: relayPath(baseURL, manifest, manifest.bundle),
    stylesheet: manifest.stylesheet === undefined ? null : relayPath(baseURL, manifest, manifest.stylesheet),
    words: bundle.words,
    unread: manifest.sidebarUnread === undefined ? null : { url: relayPath(baseURL, manifest, manifest.sidebarUnread.path), field: manifest.sidebarUnread.field }
  };
}

/** The path below a screen path a share page stands under. */
export function sharePage(manifest: ConsoleManifest, path: string): boolean {
  return path.startsWith(`${manifest.screenPath}/share/`);
}

// Whether a path names a `.` or `..` segment, or two slashes in a row, any of which the unit's address would resolve
// to a path other than the one written, and so stands under nothing a manifest lets through.
function walksOut(path: string): boolean {
  const parts = path.split("/").slice(1);

  return parts.some((part, at) => part === "." || part === ".." || (part === "" && at < parts.length - 1));
}

/** Whether a path of a service's API is one the relay hands on: under its API prefix, or its module or stylesheet. */
export function relayedPath(manifest: ConsoleManifest, path: string): boolean {
  if (walksOut(path)) return false;

  if (path === manifest.bundle || path === manifest.stylesheet) return true;

  const prefix = manifest.apiPrefix.replace(/\/+$/, "");

  return prefix === "" || path === prefix || path.startsWith(`${prefix}/`);
}

/** Whether a call of a service's API is one the relay hands on: a path `relayedPath` lets through, or a route the
 * manifest names under `relays` by its method and path. */
export function relayedCall(manifest: ConsoleManifest, method: string, path: string): boolean {
  return relayedPath(manifest, path) || (!walksOut(path) && relaysRoute(manifest, method, path));
}

/** The bundle whose screen path a page address stands under, read from the console's base path, or null where none. */
export function bundleOfPage(baseURL: string, page: string | undefined): AttachedBundle | null {
  if (page === undefined || page === "") return null;

  let path: string;

  try {
    path = new URL(page, "http://console.invalid").pathname;
  } catch {
    return null;
  }

  const base = baseURL.replace(/\/+$/, "");

  if (base !== "") {
    if (path !== base && !path.startsWith(`${base}/`)) return null;

    path = path.slice(base.length) || "/";
  }

  return attached.find(({ manifest }) => path === manifest.screenPath || path.startsWith(`${manifest.screenPath}/`)) ?? null;
}

/** Whether a read is of a bundle's own files: its module, its stylesheet, or a file in its module's folder or below it. */
export function bundleFiles(manifest: ConsoleManifest, path: string): boolean {
  const folder = manifest.bundle.slice(0, manifest.bundle.lastIndexOf("/") + 1);
  const below = path.slice(folder.length).split("/");

  return bundleFile(manifest, path) || (folder !== "/" && path.startsWith(folder) && below.every((step) => step !== "" && step !== "." && step !== ".."));
}

/**
 * Whether a call from a page reaches a service a manifest names (docs/web.md, 「Screens a unit brings」): a page that
 * is no bundle's screen, the service's own bundle's page, and a page whose manifest names the service under `calls`
 * reach it; any other bundle's page reaches only a read of the service's own files.
 */
export function pageReaches(page: AttachedBundle | null, called: AttachedBundle, method: string, path: string): boolean {
  if (page === null || screensCall(page.manifest, called.manifest.serviceName)) return true;

  return (method === "GET" || method === "HEAD") && bundleFiles(called.manifest, path);
}

/** Whether a path is a bundle's module or stylesheet, which the relay hands on to a reader not signed in as well. */
export function bundleFile(manifest: ConsoleManifest, path: string): boolean {
  return path === manifest.bundle || (manifest.stylesheet !== undefined && path === manifest.stylesheet);
}
