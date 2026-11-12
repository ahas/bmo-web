import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { CONSOLE_SHARED_LIBRARIES } from "bmo-ui/shared/console-manifest";
import { addTemplate, defineNuxtModule, resolvePath } from "nuxt/kit";

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
  "@nuxt/ui": async () => {
    // The component library's runtime stands beside its module's entry.
    const runtime = join(dirname(await resolvePath("@nuxt/ui")), "runtime");

    return ["components", "composables"].flatMap((folder) => filesOf(join(runtime, folder), `@nuxt/ui/${folder}`).map(([path, file]) => line(path, file)));
  },
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
