import { CONSOLE_MANIFEST_ROUTE, LAYER_BOUND, LAYER_VERSION, consoleManifest, movedScreenAddress, onThisLayer, relaysRoute, roleAllows, screensCall } from "bmo-ui/shared/console-manifest";

import { ownerKeyOf, ownerRoleOf } from "./owner-key";
import { unitHeaders } from "./units";

import type { SignedIn } from "./accounts";
import type { UnitAddress } from "./units";
import type { ConsoleScreen } from "#shared/console-bundles";
import type { ConsoleManifest, ConsoleRole, ConsoleWords } from "bmo-ui/shared/console-manifest";

// The console bundles the units bring (docs/web.md, 「Screens a unit brings」; bmo-ui's `docs/console-bundles.md`):
// every unit the settings name is asked for its manifest, and a unit whose manifest reads, on a release inside the
// range of the layer the console runs, brings its bundle, its words and its relay. The list is the console's own and
// names no unit; a unit is whatever its manifest says.

/** One bundle attached: the manifest as it reads, the unit that answered it, and the bundle's words. */
export interface AttachedBundle {
  manifest: ConsoleManifest;
  unit: UnitAddress;
  words: ConsoleWords;
}

// Each unit's bundle as its last answer brought it, and each unit's ask still out. An ask waits for its unit's
// answer, so a unit still answering keeps what it last brought and is not asked again until it has answered, and no
// unit taking its time holds up another's screens.
const brought = new Map<string, AttachedBundle | null>();
const asking = new Map<string, Promise<void>>();

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

/** The prefix of Nuxt's runtime settings: the console's own, never a unit's address. */
const CONSOLE_SETTING_PREFIX = "NUXT_";

/** Every unit the settings name, as `<NAME>_ADDRESS` with an address set, with its token. */
export function namedUnits(environment: Record<string, string | undefined> = process.env): { name: string; unit: UnitAddress }[] {
  const named: { name: string; unit: UnitAddress }[] = [];

  for (const [key, value] of Object.entries(environment)) {
    const name = /^([A-Z][A-Z0-9_]*)_ADDRESS$/.exec(key)?.[1];
    const address = value?.trim() ?? "";

    if (name === undefined || name.startsWith(CONSOLE_SETTING_PREFIX) || address === "") continue;

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

// Why each thing the console left out was left out, as its log last said it: a reason is written as it first stands
// and again where it changes, never at every reading of the manifests while it stands.
const written = new Map<string, string>();

/** Writes why a thing is left out into the console's log, unless the log already says so; null clears the record. */
function recordLeftOut(subject: string, reason: string | null): void {
  if (reason === null) {
    written.delete(subject);

    return;
  }

  if (written.get(subject) === reason) return;

  written.set(subject, reason);
  console.error(`console bundles: ${subject} is left out: ${reason}`);
}

/**
 * One unit's bundle, or null where it answers none, its manifest does not read, its bundle is built on a release
 * outside the range of the layer the console runs (older than its bound, newer than its own release, or one the
 * layer's ledger does not hold) or its words do not answer; each but the first says why in the console's log, a
 * layer outside the range named beside the console's own and its bound.
 */
export async function askedBundle(name: string, unit: UnitAddress): Promise<AttachedBundle | null> {
  const subject = `${name}'s bundle`;
  const value = await answered(unit, CONSOLE_MANIFEST_ROUTE);

  if (value === undefined) {
    recordLeftOut(subject, null);

    return null;
  }

  let manifest: ConsoleManifest;

  try {
    manifest = consoleManifest(value);
  } catch (error) {
    recordLeftOut(subject, (error as Error).message);

    return null;
  }

  if (!onThisLayer(manifest)) {
    recordLeftOut(
      subject,
      `it is built on bmo-ui ${manifest.layer}, and the console runs bmo-ui ${LAYER_VERSION}, which attaches bundles built on bmo-ui ${LAYER_BOUND} up to its own`
    );

    return null;
  }

  const words = await answered(unit, manifest.words);

  if (typeof words !== "object" || words === null || Array.isArray(words)) {
    recordLeftOut(subject, `its words do not answer at ${manifest.words}`);

    return null;
  }

  recordLeftOut(subject, null);

  return { manifest, unit, words: words as ConsoleWords };
}

// Every screen path a manifest names: its own, and those its screens stood under before.
function screenPaths(manifest: ConsoleManifest): string[] {
  return [manifest.screenPath, ...manifest.formerScreenPaths];
}

/** The service the console answers itself: the members of the reader's company (docs/web.md, 「Screens a unit
 * brings」), which a bundle names under `calls` as it names any service. */
export const CONSOLE_PEOPLE_SERVICE = "people";

// Why a bundle is left out by itself, or null where nothing of its own leaves it out.
function ownClash(manifest: ConsoleManifest): string | null {
  return manifest.serviceName === CONSOLE_PEOPLE_SERVICE ? `its service is named ${CONSOLE_PEOPLE_SERVICE}, which the console answers itself` : null;
}

/** The bundles with every two that share a name, a screen path or a service name left out, both of them, and every
 * one whose service bears a name the console answers itself; a former screen path counts as a screen path. */
export function withoutConflicts(found: readonly AttachedBundle[]): AttachedBundle[] {
  const clash = (one: ConsoleManifest, other: ConsoleManifest) =>
    one.name === other.name || one.serviceName === other.serviceName || screenPaths(one).some((path) => screenPaths(other).includes(path));

  return found.filter((bundle) => {
    const others = found.filter((other) => other !== bundle && clash(bundle.manifest, other.manifest));
    const reason = ownClash(bundle.manifest) ?? (others.length > 0 ? "it shares its name, screen or service with another, and both are left out" : null);

    recordLeftOut(`the bundle ${bundle.manifest.name}`, reason);

    return reason === null;
  });
}

// Stands what every unit last brought as the attached bundles.
function standBrought(): void {
  attachBundles(withoutConflicts([...brought.values()].filter((bundle): bundle is AttachedBundle => bundle !== null)));
}

// Asks one unit for its manifest and stands what it brings once it answers; a unit whose ask is still out is not
// asked twice, and the ask out is what is waited on.
function ask(name: string, unit: UnitAddress): Promise<void> {
  const out = asking.get(name);

  if (out !== undefined) return out;

  const asked = askedBundle(name, unit)
    .then((bundle) => {
      brought.set(name, bundle);
    })
    .finally(() => {
      asking.delete(name);
      standBrought();
    });

  asking.set(name, asked);

  return asked;
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

  await Promise.all(units.filter(({ name }) => !asking.has(name)).map(({ name, unit }) => ask(name, unit)));
  standBrought();

  return attached;
}

/**
 * Asks the unit that brought a bundle for its manifest again at once, or waits on its ask still out, and settles
 * once what it answers is attached (docs/web.md, 「Screens a unit brings」): a unit released since its last ask
 * serves its bundle's files under new names. A bundle that no unit's last answer still holds is already read again,
 * and asks nothing.
 */
export async function readManifestAgain(bundle: AttachedBundle): Promise<void> {
  for (const [name, held] of brought) {
    if (held === bundle) return ask(name, bundle.unit);
  }
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
    counted: manifest.sidebarUnread !== undefined,
    sidebarSection: manifest.sidebarSection
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

/** Whether a call of a service's API is one the relay hands on: a path `relayedPath` lets through, a route the
 * manifest names under `relays` by its method and path, or a read of a file `bundleFiles` names, as a chunk its
 * module imports is. */
export function relayedCall(manifest: ConsoleManifest, method: string, path: string): boolean {
  if (relayedPath(manifest, path)) return true;

  if (walksOut(path)) return false;

  return relaysRoute(manifest, method, path) || (reads(method) && bundleFiles(manifest, path));
}

// Whether a method only reads.
function reads(method: string): boolean {
  const asked = method.toUpperCase();

  return asked === "GET" || asked === "HEAD";
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

/**
 * The address a page moved to, where its path, read from the console's base path with its query, stands under a
 * former screen path of an attached bundle: the same address under that bundle's screen path, its query kept and the
 * console's base path before it; null where it stands under none, and for the console's API and its assets.
 */
export function movedPage(baseURL: string, address: string): string | null {
  if (address.startsWith("/api/") || address.startsWith("/_")) return null;

  for (const { manifest } of attached) {
    const moved = movedScreenAddress(manifest, address);

    if (moved !== null) return `${baseURL.replace(/\/+$/, "")}${moved}`;
  }

  return null;
}

/** Whether a read is of a bundle's own files: its module, its stylesheet, or a file in its module's folder or below it. */
export function bundleFiles(manifest: ConsoleManifest, path: string): boolean {
  const folder = manifest.bundle.slice(0, manifest.bundle.lastIndexOf("/") + 1);
  const below = path.slice(folder.length).split("/");

  return bundleFile(manifest, path) || (folder !== "/" && path.startsWith(folder) && below.every((step) => step !== "" && step !== "." && step !== ".."));
}

// The translator the console's runtime configuration names, as bmo-ui's `translation` module reads it on a screen.
interface NamedTranslator {
  service?: unknown;
  path?: unknown;
}

/**
 * Whether a call of a unit the console calls directly is the translator's ask (docs/web.md, 「Screens a unit
 * brings」): a `POST` of the route the console's translator setting names, on the service it names. A console that
 * names no translator has no such ask.
 */
export function translatorAsk(serviceName: string, method: string, path: string): boolean {
  const named = (useRuntimeConfig().public as { bmoUi?: { translator?: NamedTranslator } } | undefined)?.bmoUi?.translator;
  const service = typeof named?.service === "string" ? named.service.trim() : "";
  const route = typeof named?.path === "string" ? named.path.trim().replace(/\/+$/, "") : "";

  return service !== "" && route !== "" && service === serviceName && route === path && method.toUpperCase() === "POST";
}

/** Whether a page may ask a unit the console calls directly for a translation: a page of the console's own, whose
 * shared translation asks the same route, or a bundle's page whose manifest names the unit under `calls`, which the
 * reader may open. */
export function pageTranslates(page: AttachedBundle | null, serviceName: string, reader: Reader): boolean {
  return page === null || (screensCall(page.manifest, serviceName) && readerMay(reader, page.manifest));
}

/** Whether a page names a service it calls: a page that is no bundle's screen does, and a bundle's page does where
 * the service is its own or its manifest names it under `calls`. */
export function pageNames(page: AttachedBundle | null, serviceName: string): boolean {
  return page === null || screensCall(page.manifest, serviceName);
}

/**
 * Whether a call from a page reaches a service a manifest names (docs/web.md, 「Screens a unit brings」): a page that
 * is no bundle's screen, the service's own bundle's page, and a page whose manifest names the service under `calls`
 * reach it; any other bundle's page reaches only a read of the service's own files.
 */
export function pageReaches(page: AttachedBundle | null, called: AttachedBundle, method: string, path: string): boolean {
  if (pageNames(page, called.manifest.serviceName)) return true;

  return reads(method) && bundleFiles(called.manifest, path);
}

/** Whether a path is a bundle's module or stylesheet, which the relay hands on to a reader not signed in as well. */
export function bundleFile(manifest: ConsoleManifest, path: string): boolean {
  return path === manifest.bundle || (manifest.stylesheet !== undefined && path === manifest.stylesheet);
}
