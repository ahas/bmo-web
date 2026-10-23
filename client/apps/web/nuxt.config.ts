import { fileURLToPath } from "node:url";

import { parseYAML } from "confbox";

// The server's language pack (docs/language-pack.md), whose parts the console's own code reads where
// it shows a line a unit answers with as a code, and the data beside the console's pack, the words it
// matches on. A file is imported as a module holding its tree. The build runs on Node, where the
// runtime's own YAML import is not at hand, so the parser is the one Nuxt's own configuration loading
// carries. The console's pack itself is the i18n module's to read.
const yamlFolders = [
  fileURLToPath(new URL("../../../server/lang/", import.meta.url)),
  fileURLToPath(new URL("./i18n/data/", import.meta.url))
];
const yamlData = {
  name: "bmo-web-yaml-data",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    return yamlFolders.some((folder) => id.startsWith(folder)) && id.endsWith(".yaml")
      ? { code: `export default ${JSON.stringify(parseYAML(code))};`, map: null }
      : null;
  }
};

// The base path every page and road stands under; the deployment's reverse proxy hands it on as it is
// (docs/web.md, 「Where it opens」).
const baseURL = process.env.BMO_WEB_BASE_URL || "/bmo/";

export default defineNuxtConfig({
  // bmo-ui, the base every screen stands on. The screens a unit brings are loaded from its manifest while
  // the console runs, on the libraries `modules/console-shared.ts` lists (docs/web.md, 「Screens a unit
  // brings」); bmo-ui's `docs/console-bundles.md` is the contract.
  extends: ["bmo-ui"],
  modules: ["./modules/console-shared", "nuxt-auth-utils", "@nuxtjs/i18n"],
  // The console's own styles, stated after the layers' (the conversation's measures and colours, its
  // documents and its interface faces); what bmo-ui's stylesheet carries is the layer's.
  css: ["~/assets/css/main.css"],
  compatibilityDate: "2025-09-01",
  devtools: { enabled: false },
  ssr: true,
  // A worker's standing dev console serves a copy under a path of its own and builds into a directory
  // of its own, so a typecheck in the same checkout does not rewrite what it is serving. Nothing named,
  // the console is what it always is.
  buildDir: process.env.BMO_WEB_BUILD_DIR || ".nuxt",
  app: {
    baseURL,
    head: {
      htmlAttrs: { lang: "ko" },
      meta: [
        // The chrome of an installed copy takes the console's own background.
        { name: "theme-color", content: "#18181b" },
        // The standard name is what Chromium reads; the Apple one stays for Safari's home screen.
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }
      ],
      link: [
        { rel: "manifest", href: `${baseURL}manifest.webmanifest` },
        // A tab is drawn at 16 or 32 pixels, each with a picture drawn for that size (docs/web.md,
        // 「The console's pictures」); the installed app takes its own from the manifest.
        { rel: "icon", type: "image/png", sizes: "16x16", href: `${baseURL}icons/favicon-16.png` },
        { rel: "icon", type: "image/png", sizes: "32x32", href: `${baseURL}icons/favicon-32.png` },
        { rel: "apple-touch-icon", sizes: "180x180", href: `${baseURL}icons/apple-touch-icon.png` }
      ]
    }
  },
  // The zone every time is shown in, the locale figures are written and letter case folded in, and the
  // dayjs locale dates' words are written in, all stated since the console renders on the server as well
  // as in the browser (bmo-ui's `docs/boundary.md`, 「What the host owes」). The dayjs locale is loaded
  // by the app's own plugin.
  appConfig: {
    // Where a bundle's screens call its service: the console's relay base, then the service's name
    // and the path the service's own API writes (bmo-ui's `docs/console-bundles.md`).
    bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko", relayBase: "/api" }
  },
  // The chat agent's names, the deployment's to set and no code file's (docs/web.md, 「Settings」): the name its
  // messages stand under and the label rooms call it by, set at run time as `NUXT_PUBLIC_CHAT_AGENT_NAME` and
  // `NUXT_PUBLIC_CHAT_AGENT_LABEL`.
  runtimeConfig: {
    // How long the relay waits for the translator's route to begin its answer, set at run time as
    // `NUXT_TRANSLATOR_BEGIN_MS` (docs/boundary.md, 「Settings」).
    translatorBeginMs: 90_000,
    public: {
      chatAgent: { name: "", label: "" },
      // The installed app's shell version, which the shell-version module states as the build stands.
      shellVersion: ""
    }
  },
  // A dev server answers only the hosts it is told of: those `BMO_WEB_DEV_HOSTS` names, comma-separated.
  vite: {
    server: { allowedHosts: (process.env.BMO_WEB_DEV_HOSTS ?? "").split(",").filter((host) => host !== "") },
    // The development server pre-bundles only what its scan of the console's own files finds. The layer's
    // modules stand inside node_modules, where the scan does not go, and bmo-ui's time module imports dayjs
    // and its plugins, which ship as CommonJS. Served unbundled, the browser finds no default export in
    // dayjs, and the app does not start. So they are named here.
    optimizeDeps: { include: ["dayjs", "dayjs/plugin/utc", "dayjs/plugin/timezone"] },
    plugins: [yamlData],
    build: {
      // Rolldown's notice of how much of a build its plugins took is off. Most of a Nuxt build is plugin
      // work by its nature, so the notice stands on every build and names nothing a change could act on.
      rolldownOptions: { checks: { pluginTimings: false } },
      // Every chunk past the default 500 kB is a library loaded only by the screen that needs it, the
      // code editor and the diagram renderer's layout engine among them. None can be cut smaller from
      // here, so the warning stands just above the largest of them.
      chunkSizeWarningLimit: 7000
    }
  },
  nitro: {
    // A console bundle whose screen opens a socket has it relayed like any other call: the console
    // hands the upgrade on to the service the manifest names (bmo-ui's `docs/console-bundles.md`).
    experimental: { websocket: true },
    // A deployment builds a release of its own beside the one being served and only then moves onto it,
    // because nitro splits the build by route and a running server reads a route's chunk off disk the
    // first time that route is asked for (docs/web.md, 「Running as a service」). Whoever is deploying
    // names the directory here; with nothing named the build writes where it always does.
    output: { dir: process.env.BMO_WEB_OUTPUT_DIR ?? ".output" },
    // The runtime's own modules stay imports, not bundled files.
    rollupConfig: { external: [/^bun$/, /^bun:/], plugins: [yamlData] },
    typescript: { tsConfig: { compilerOptions: { types: ["@types/bun"] } } }
  },
  // The four units the console calls publish a client whose entry is TypeScript. Nitro's esbuild pass skips
  // node_modules, so its bundler would read that entry as JavaScript and stop; the filter is stated whole here,
  // because one given through `nitro.esbuild` has Nuxt's node_modules exclusion merged into it. TypeScript is
  // handed to esbuild wherever it comes from, and JavaScript in node_modules is still left alone.
  hooks: {
    "nitro:config"(nitroConfig) {
      nitroConfig.esbuild ??= {};
      nitroConfig.esbuild.options ??= {};
      nitroConfig.esbuild.options.include = /\.(?:ts|tsx)$/;
      nitroConfig.esbuild.options.exclude = [];
    }
  },
  $production: {
    nitro: { preset: "bun" }
  },
  // One language, one pack: every word the console shows is a key into `i18n/locales/ko.yaml`, so a
  // wording fix is an edit to that file alone (docs/web.md, 「Wording and the language pack」).
  // `language` is what the module writes into the document's `lang`.
  i18n: {
    strategy: "no_prefix",
    defaultLocale: "ko",
    detectBrowserLanguage: false,
    locales: [{ code: "ko", language: "ko-KR", file: "ko.yaml" }]
  },
  ui: {
    // Registers ContentSearch and ContentSearchButton, which the sidebar's search is; the console has no
    // @nuxt/content, and the palette is handed its groups directly.
    content: true
  }
});
