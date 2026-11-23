import { execFileSync } from "node:child_process";

import { defineNuxtModule } from "nuxt/kit";

// The console's version, stated to the screens units bring as bmo-ui's `consoleVersion` (docs/web.md, 「Screens a
// unit brings」; bmo-ui's `docs/boundary.md`, 「What the host owes」): the short form of the commit the console is
// built from. A deployment builds the console in a checkout standing at the commit it deploys and names the commit in
// no setting, so the build reads it from git; a build outside any checkout states it empty.

/** What git answers for the commit a folder's checkout stands at, in its short form. */
function shortHead(folder: string): string {
  return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: folder, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** The version of a console built in a folder: its checkout's commit in short form, empty where git names none. */
export function consoleVersionAt(folder: string, head: (folder: string) => string = shortHead): string {
  try {
    return head(folder).trim();
  } catch {
    return "";
  }
}

export default defineNuxtModule({
  meta: { name: "bmo-console-version" },
  setup(_options, nuxt) {
    nuxt.options.appConfig.bmoUi = { ...nuxt.options.appConfig.bmoUi, consoleVersion: consoleVersionAt(nuxt.options.rootDir) };
  }
});
