import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { addTemplate, defineNuxtModule, resolvePath } from "nuxt/kit";

// The libraries a console bundle shares with the console (docs/web.md, 「Screens a unit brings」; bmo-ui's
// `docs/console-bundles.md`, 「What a console owes」): every path of `vue`, `vue-router`, `vue-i18n`, `nuxt/app`,
// `@nuxt/ui` and bmo-ui a bundle may import, each with the loader of the console's own copy. The browser's bundle
// loader points a bundle's import of such a path at what the loader answers, so a bundle runs on the one copy the
// app runs. The list is built from the libraries' own folders and names no bundle.

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

export default defineNuxtModule({
  meta: { name: "bmo-console-shared" },
  async setup(_options, nuxt) {
    const roots = (nuxt.options._layers ?? []).map((layer) => layer.config.rootDir);
    const layer = roots.find((root) => existsSync(join(root, "shared", "console-manifest.ts")));

    if (layer === undefined) throw new Error("The bmo-ui layer is not among the console's layers.");

    // The component library's runtime stands beside its module's entry.
    const runtime = join(dirname(await resolvePath("@nuxt/ui")), "runtime");

    const paths: [string, string][] = [
      ...["components", "domain"].flatMap((folder) => filesOf(join(layer, "app", folder), `bmo-ui/app/${folder}`)),
      ...filesOf(join(layer, "shared"), "bmo-ui/shared"),
      ...filesOf(join(runtime, "components"), "@nuxt/ui/components"),
      ...filesOf(join(runtime, "composables"), "@nuxt/ui/composables")
    ];

    const lines = [
      `  "vue": () => import("vue"),`,
      `  "vue-router": () => import("vue-router"),`,
      `  "vue-i18n": () => import("vue-i18n"),`,
      `  "nuxt/app": () => import("#app"),`,
      ...paths.map(([path, file]) => `  ${JSON.stringify(path)}: () => import(${JSON.stringify(file)}),`)
    ];

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
