import { expect, test } from "bun:test";

import { AccountRefusal, AccountServiceDown } from "../../../apps/web/server/utils/account-service";
import { AppGate, appKind, appOfKind } from "../../../apps/web/server/utils/app-gate";
import { manifestOf } from "../../support/console-manifest";

import type { AppGateDeps } from "../../../apps/web/server/utils/app-gate";
import type { AttachedBundle } from "../../../apps/web/server/utils/console-manifests";

// Whether a screen that is an app stands on for the reader (docs/web.md, 「Screens a unit brings」; docs/accounts.md,
// 「An app's two settings」): its two kinds resolved for the reader's person, a value but false letting it through, a
// kind nobody declared saying nothing against it, and any other refusal or silence holding it off.

// The chain as a test stands it: each kind's value by person, a kind it does not name refused as undeclared, and a
// kind named `failing` refused as the service failing. Every ask is counted.
function chainOf(values: Record<string, Record<string, unknown>>, failing: readonly string[] = []): AppGateDeps & { asked: string[] } {
  const asked: string[] = [];

  return {
    asked,
    resolve: async (key, person) => {
      asked.push(`${key} ${person}`);

      if (failing.includes(key)) throw new AccountServiceDown("http://127.0.0.1:1", "refused");
      if (!(key in values)) throw new AccountRefusal(404, "no-such-kind", `no kind ${key}`);

      return values[key]![person];
    }
  };
}

function bundle(name: string): AttachedBundle {
  return { manifest: manifestOf(name, {}), unit: { address: "http://127.0.0.1:1", token: null }, words: {} };
}

test("an app's kinds are named by its key and read back", () => {
  expect(appKind("screen-a", "offered")).toBe("app.screen-a.offered");
  expect(appKind("screen-a", "on")).toBe("app.screen-a.on");
  expect(appOfKind("app.screen-a.on")).toEqual({ app: "screen-a", setting: "on" });
  expect(appOfKind("app.screen-a.offered")).toEqual({ app: "screen-a", setting: "offered" });
  expect(appOfKind("supply.policy")).toBeNull();
  expect(appOfKind("app.screen-a.other")).toBeNull();
  expect(appOfKind("app.Screen.on")).toBeNull();
});

test("an app stands open where it is offered and on for the person", async () => {
  const chain = chainOf({ "app.screen-a.offered": { "7": true }, "app.screen-a.on": { "7": true } });

  expect(await new AppGate("7", chain).open("screen-a")).toBe(true);
});

test("an app not offered, or turned off, is held off", async () => {
  const offOffer = chainOf({ "app.screen-a.offered": { "7": false }, "app.screen-a.on": { "7": true } });
  const offOn = chainOf({ "app.screen-a.offered": { "7": true }, "app.screen-a.on": { "7": false } });

  expect(await new AppGate("7", offOffer).open("screen-a")).toBe(false);
  expect(await new AppGate("7", offOn).open("screen-a")).toBe(false);
});

test("a kind nobody declared, and a kind resolving to nothing, say nothing against an app", async () => {
  // No kind of the app at all: a screen that is no app.
  expect(await new AppGate("7", chainOf({})).open("screen-a")).toBe(true);
  // Only `on` declared, and it says nothing for this person.
  expect(await new AppGate("7", chainOf({ "app.screen-a.on": {} })).open("screen-a")).toBe(true);
});

test("a resolution the account service does not answer holds the app off", async () => {
  const chain = chainOf({ "app.screen-a.offered": { "7": true }, "app.screen-a.on": { "7": true } }, ["app.screen-a.on"]);
  const logged = console.error;

  console.error = () => {};

  try {
    expect(await new AppGate("7", chain).open("screen-a")).toBe(false);
  } finally {
    console.error = logged;
  }
});

test("a login with no user is held to nothing and asks nothing", async () => {
  const chain = chainOf({ "app.screen-a.on": { "7": false } });

  expect(await new AppGate(null, chain).open("screen-a")).toBe(true);
  expect(chain.asked).toEqual([]);
});

test("each app is asked once for the life of a gate, and the bundles of apps off are left out in order", async () => {
  const chain = chainOf({
    "app.screen-a.on": { "7": true },
    "app.screen-b.on": { "7": false },
    "app.screen-b.offered": { "7": true }
  });
  const gate = new AppGate("7", chain);
  const bundles = [bundle("screen-a"), bundle("screen-b"), bundle("screen-c")];

  expect((await gate.openBundles(bundles)).map((one) => one.manifest.serviceName)).toEqual(["screen-a", "screen-c"]);
  expect(await gate.open("screen-b")).toBe(false);
  expect(chain.asked.filter((one) => one.startsWith("app.screen-b.")).length).toBe(2);
});
