import { shared } from "#console-shared";

import { IMPORT_KEY, SHARED_KEY, bare, edited, editsOf, shimSource } from "./module-rewrite";

import type { ConsoleScreen } from "#shared/console-bundles";
import type { ConsoleBundleModule } from "bmo-ui/shared/console-manifest";

// A console bundle's module loaded in the browser (docs/web.md, 「Screens a unit brings」): the module is read
// through the relay, and before it runs every import it makes of a library the console shares is pointed at the
// console's own copy, so the bundle runs inside the console's app. A file of the bundle it imports is read the same
// way, one it imports only when reached at the moment it is reached. Each module read is handed to the browser as
// a module of its own, made from the text as rewritten, so the browser's own loader does the rest.

type Namespace = Record<string, unknown>;

const holder = globalThis as unknown as Record<symbol, unknown>;

// Each shared library's namespace once loaded, the module made for it, and each bundle file's module.
const namespaces = new Map<string, Namespace>();
const shims = new Map<string, string>();
const files = new Map<string, Promise<string>>();

/** A bundle that could not be loaded: its module or one of its files refused, or it imports what is not shared. */
export class BundleUnloaded extends Error {}

async function namespaceOf(specifier: string): Promise<Namespace> {
  const held = namespaces.get(specifier);

  if (held !== undefined) return held;

  const load = Object.hasOwn(shared, specifier) ? shared[specifier] : undefined;

  if (load === undefined) throw new BundleUnloaded(`a console bundle imports ${specifier}, which the console does not share`);

  const namespace = await load();

  namespaces.set(specifier, namespace);

  return namespace;
}

function moduleOf(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

async function shimOf(specifier: string): Promise<string> {
  const held = shims.get(specifier);

  if (held !== undefined) return held;

  const made = moduleOf(shimSource(specifier, Object.keys(await namespaceOf(specifier))));

  shims.set(specifier, made);

  return made;
}

async function rewritten(url: string, reading: readonly string[]): Promise<string> {
  const response = await fetch(url, { credentials: "same-origin" });

  if (!response.ok) throw new BundleUnloaded(`the bundle's file at ${url} answered ${response.status}`);

  const source = await response.text();
  const edits = await editsOf(source, url, async (specifier) => {
    if (bare(specifier)) return shimOf(specifier);

    const address = new URL(specifier, url).href;

    if (reading.includes(address)) throw new BundleUnloaded(`the bundle's files at ${url} and ${address} import each other`);

    return fileOf(address, [...reading, url]);
  });

  return edited(source, edits);
}

function fileOf(url: string, reading: readonly string[] = []): Promise<string> {
  let held = files.get(url);

  if (held === undefined) {
    held = rewritten(url, reading).then(moduleOf);
    files.set(url, held);
    // A file that did not load is asked again the next time, not held as failed.
    held.catch(() => files.delete(url));
  }

  return held;
}

// What a bundle's dynamic import reaches: a shared library's own namespace, or a file of the bundle read against
// the address of the module that imports it.
async function imported(base: string, specifier: string): Promise<unknown> {
  if (bare(specifier)) return namespaceOf(specifier);

  // The address is had first: the build wraps a dynamic import in a function of its own, where no wait stands.
  const address = await fileOf(new URL(specifier, base).href);

  return import(/* @vite-ignore */ address);
}

function standLoader(): void {
  holder[Symbol.for(SHARED_KEY)] = namespaces;
  holder[Symbol.for(IMPORT_KEY)] = imported;
}

const stylesheets = new Set<string>();

// The cascade layer every bundle's stylesheet stands in: above the console's base, so a bundle's own styles reach
// its elements, and below the console's components and utilities, so a class both style reads as the console's
// and a bundle's copy of a utility never undoes the console's frame around it.
const BUNDLE_LAYER = "console-bundles";

/** Links a bundle's stylesheet once, in the bundles' layer, the layer's place stated ahead of every stylesheet. */
function linkStylesheet(address: string): void {
  if (stylesheets.has(address)) return;

  if (stylesheets.size === 0) {
    const order = document.createElement("style");

    order.textContent = `@layer theme, base, ${BUNDLE_LAYER}, components, utilities;`;
    document.head.prepend(order);
  }

  stylesheets.add(address);

  const sheet = document.createElement("style");

  sheet.textContent = `@import url(${JSON.stringify(address)}) layer(${BUNDLE_LAYER});`;
  document.head.append(sheet);
}

/** A bundle's module loaded, its stylesheet linked; what it exports as its default. */
export async function loadBundle(screen: ConsoleScreen): Promise<ConsoleBundleModule> {
  standLoader();

  if (screen.stylesheet !== null) linkStylesheet(screen.stylesheet);

  const address = await fileOf(new URL(screen.module, window.location.href).href);
  const module = (await import(/* @vite-ignore */ address)) as { default?: ConsoleBundleModule };

  if (!Array.isArray(module.default?.routes)) throw new BundleUnloaded(`the bundle ${screen.name} exports no routes`);

  return module.default;
}
