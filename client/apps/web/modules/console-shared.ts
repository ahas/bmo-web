import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { CONSOLE_SHARED_LIBRARIES } from "bmo-ui/shared/console-manifest";
import { init as lexerReady, parse as parseModule } from "es-module-lexer";
import { addTemplate, defineNuxtModule, resolvePath, tryResolveModule } from "nuxt/kit";
import { parse as parseComponent } from "vue/compiler-sfc";

// The libraries a console bundle shares with the console (docs/web.md, 「Screens a unit brings」; bmo-ui's
// `docs/console-bundles.md`, 「What a console owes」): every path of each library bmo-ui's `CONSOLE_SHARED_LIBRARIES`
// lists that a bundle may import, each with the loader of the console's own copy. The browser's bundle loader
// points a bundle's import of such a path at what the loader answers, so a bundle runs on the one copy the app
// runs. The paths are read from the libraries' own folders and name no bundle.

const SOURCE = /\.(?:vue|ts|js|mjs)$/;

// The files of a folder a bundle may import, each under the path it is imported by: a component with its
// extension, a module without it as well as with it.
function filesOf(folder: string, prefix: string): [string, string][] {
  if (!existsSync(folder)) return [];

  const files: [string, string][] = [];

  for (const name of readdirSync(folder)) {
    // A declaration file, whatever it declares, is no module of the library's own.
    if (!SOURCE.test(name) || name.includes(".d.")) continue;

    const file = join(folder, name);

    files.push([`${prefix}/${name}`, file]);

    if (!name.endsWith(".vue")) files.push([`${prefix}/${name.replace(SOURCE, "")}`, file]);
  }

  return files;
}

// The optional peers a package names in its manifest that the install does not hold, each resolved from the package
// as its own imports are.
async function absentOptionalPeers(packageDir: string): Promise<string[]> {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };
  const optional = Object.entries(manifest.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta.optional === true)
    .map(([name]) => name);
  const from = pathToFileURL(join(packageDir, "package.json")).href;
  const found = await Promise.all(optional.map((name) => tryResolveModule(name, from)));

  return optional.filter((_, at) => found[at] === undefined);
}

// The script a file runs: each script block of a component, and a module whole.
function scriptsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");

  if (!file.endsWith(".vue")) return [source];

  const { descriptor } = parseComponent(source, { filename: file });

  return [descriptor.script, descriptor.scriptSetup].flatMap((block) => (block === null ? [] : [block.content]));
}

// The modules a file imports by name.
async function importsOf(file: string): Promise<string[]> {
  await lexerReady;

  return scriptsOf(file).flatMap((script) => parseModule(script)[0].flatMap((entry) => (entry.n === undefined ? [] : [entry.n])));
}

// The paths of the component library a bundle may import, each with its file: the components and composables of its
// runtime the console can load. One that imports an optional peer the console has not installed is left out, since
// the shared module imports every file it lists and that import would stop the console's build.
export async function nuxtUiFiles(packageDir: string): Promise<[string, string][]> {
  const runtime = join(packageDir, "dist", "runtime");
  const absent = await absentOptionalPeers(packageDir);
  const needsAbsent = (name: string) => absent.some((peer) => name === peer || name.startsWith(`${peer}/`));
  const files = ["components", "composables"].flatMap((folder) => filesOf(join(runtime, folder), `@nuxt/ui/${folder}`));
  const loadable = await Promise.all(files.map(async ([, file]) => !(await importsOf(file)).some(needsAbsent)));

  return files.filter((_, at) => loadable[at]);
}

// One line of the shared module: a path a bundle imports, and the console's own copy it loads instead.
function line(path: string, copy: string): string {
  return `  ${JSON.stringify(path)}: () => import(${JSON.stringify(copy)}),`;
}

// How the console hands a bundle each library it shares: the paths of the library a bundle may import, each with
// the console's copy. A library bmo-ui lists that has no way here stops the build, since a bundle importing it would
// find nothing in the browser.
const SHARED_WAYS: Record<string, (layer: string) => Promise<string[]>> = {
  vue: async () => [line("vue", "vue")],
  "vue-router": async () => [line("vue-router", "vue-router")],
  "vue-i18n": async () => [line("vue-i18n", "vue-i18n")],
  "nuxt/app": async () => [line("nuxt/app", "#app")],
  // The module's entry stands in the package's `dist`.
  "@nuxt/ui": async () => (await nuxtUiFiles(dirname(dirname(await resolvePath("@nuxt/ui"))))).map(([path, file]) => line(path, file)),
  "bmo-ui": async (layer) =>
    [
      ...["components", "domain"].flatMap((folder) => filesOf(join(layer, "app", folder), `bmo-ui/app/${folder}`)),
      ...filesOf(join(layer, "shared"), "bmo-ui/shared")
    ].map(([path, file]) => line(path, file))
};

export default defineNuxtModule({
  meta: { name: "bmo-console-shared" },
  async setup(_options, nuxt) {
    const roots = (nuxt.options._layers ?? []).map((layer) => layer.config.rootDir);
    const layer = roots.find((root) => existsSync(join(root, "shared", "console-manifest.ts")));

    if (layer === undefined) throw new Error("The bmo-ui layer is not among the console's layers.");

    const unknown = CONSOLE_SHARED_LIBRARIES.filter((library) => SHARED_WAYS[library] === undefined);

    if (unknown.length > 0) throw new Error(`bmo-ui lists shared libraries the console cannot hand a bundle: ${unknown.join(", ")}`);

    const lines = (await Promise.all(CONSOLE_SHARED_LIBRARIES.map((library) => SHARED_WAYS[library]!(layer)))).flat();

    const template = addTemplate({
      filename: "console-shared.mjs",
      write: true,
      getContents: () => `export const shared = {\n${lines.join("\n")}\n};\n`
    });

    nuxt.options.alias["#console-shared"] = template.dst;

    // The module's type stands beside it, where the alias's own resolution finds it.
    addTemplate({
      filename: "console-shared.d.mts",
      write: true,
      getContents: () => "export declare const shared: Readonly<Record<string, () => Promise<Record<string, unknown>>>>;\n"
    });
  }
});
