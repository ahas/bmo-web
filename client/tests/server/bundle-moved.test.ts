import { afterEach, expect, test } from "bun:test";

import { consoleManifest } from "bmo-ui/shared/console-manifest";

import { attachBundles } from "../../apps/web/server/utils/console-manifests";
import { standInHandler } from "../support/route-handler";

// An address under a bundle's former screen path is answered as moved (docs/web.md, 「Screens a unit brings」): a 308 to
// the same address under its screen path, with no session read, and every other address passes on untouched.

const globals: Record<string, unknown> = globalThis;
const redirects: { location: string; code: number }[] = [];

globals.defineEventHandler = (handler: unknown) => handler;
globals.useRuntimeConfig = () => ({ app: { baseURL: "/bmo/" } });
globals.sendRedirect = (_event: unknown, location: string, code: number) => {
  redirects.push({ location, code });

  return "";
};
globals.getUserSession = () => {
  throw new Error("a moved address reads no session");
};

const handler = standInHandler((await import("../../apps/web/server/middleware/bundle-moved")).default);
const unit = { address: "http://unit.invalid", token: "token-a" };

attachBundles([
  {
    manifest: consoleManifest({ name: "unit-a", title: "unit-a.title", icon: "i-material-symbols-circle", screenPath: "/artifact", formerScreenPaths: ["/archive"], serviceName: "unit-a", bundle: "/console/bundle.js", words: "/console/words", role: "member" }),
    unit,
    words: {}
  }
]);

afterEach(() => void redirects.splice(0));

test("a share link kept from before the move is answered 308 at its new address, with no session behind it", async () => {
  await handler({ path: "/bmo/archive/share/5fjE9YBJ?from=room" });

  expect(redirects).toEqual([{ location: "/bmo/artifact/share/5fjE9YBJ?from=room", code: 308 }]);
});

test("the former screen path itself and a page below it move alike", async () => {
  await handler({ path: "/bmo/archive" });
  await handler({ path: "/bmo/archive/58" });

  expect(redirects.map((one) => one.location)).toEqual(["/bmo/artifact", "/bmo/artifact/58"]);
});

test("an address under the screen path, the console's own API or no former path passes on", async () => {
  for (const path of ["/bmo/artifact/share/5fjE9YBJ", "/bmo/api/artifact/documents", "/bmo/archived", "/bmo/rooms"]) {
    expect(await handler({ path })).toBeUndefined();
  }

  expect(redirects).toEqual([]);
});
