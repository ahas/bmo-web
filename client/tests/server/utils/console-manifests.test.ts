import { afterAll, expect, test } from "bun:test";

import { consoleManifest } from "bmo-ui/shared/console-manifest";

import { askedBundle, namedUnits, readerMay, relayedCall, relayedPath, screenOf, sharePage, withoutConflicts } from "../../../apps/web/server/utils/console-manifests";

// The manifests the units answer (docs/web.md, 「Screens a unit brings」): every unit the settings name is asked, a
// manifest that reads brings its bundle with its words, and two that clash bring none.

function manifestOf(fields: Record<string, unknown> = {}) {
  return { name: "unit-a", title: "unit-a.title", icon: "i-material-symbols-circle", screenPath: "/unit-a", serviceName: "unit-a", bundle: "/console/bundle.js", words: "/console/words", role: "member", ...fields };
}

const answers: Record<string, () => Response> = {};
const served = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const answer = answers[new URL(request.url).pathname];

    return answer === undefined ? Response.json({ code: "no-route" }, { status: 404 }) : answer();
  }
});
const unit = { address: `http://127.0.0.1:${served.port}`, token: "token-a" };

afterAll(() => void served.stop(true));

test("the units asked are those whose address is set, each with its token", () => {
  const named = namedUnits({ UNIT_A_ADDRESS: "http://a.invalid/", UNIT_A_TOKEN: "t", UNIT_B_ADDRESS: "", OTHER: "x" });

  expect(named).toEqual([{ name: "UNIT_A", unit: { address: "http://a.invalid", token: "t" } }]);
});

test("a manifest that reads brings its bundle with its words", async () => {
  answers["/console-manifest"] = () => Response.json(manifestOf());
  answers["/console/words"] = () => Response.json({ ko: { "unit-a": { title: "a" } } });

  const bundle = await askedBundle("UNIT_A", unit);

  expect(bundle?.manifest.apiPrefix).toBe("/");
  expect(bundle?.words).toEqual({ ko: { "unit-a": { title: "a" } } });
});

test("a unit that answers no manifest, one that does not read, or words that do not answer, brings none", async () => {
  delete answers["/console-manifest"];
  expect(await askedBundle("UNIT_A", unit)).toBeNull();

  answers["/console-manifest"] = () => Response.json(manifestOf({ role: "owner" }));
  expect(await askedBundle("UNIT_A", unit)).toBeNull();

  answers["/console-manifest"] = () => Response.json(manifestOf());
  delete answers["/console/words"];
  expect(await askedBundle("UNIT_A", unit)).toBeNull();
});

test("two manifests sharing a name, a screen path or a service name both bring none", () => {
  const bundle = (fields: Record<string, unknown>) => ({ manifest: consoleManifest(manifestOf(fields)), unit, words: {} });
  const kept = withoutConflicts([
    bundle({}),
    bundle({ name: "unit-b", title: "unit-b.title", serviceName: "unit-b" }),
    bundle({ name: "unit-c", title: "unit-c.title", screenPath: "/unit-c", serviceName: "unit-c" })
  ]);

  expect(kept.map((one) => one.manifest.name)).toEqual(["unit-c"]);
});

test("a screen opens to a role the manifest's allows, and to a login with a user where it asks for the owner key", () => {
  const member = consoleManifest(manifestOf());
  const administrator = consoleManifest(manifestOf({ role: "administrator" }));
  const keyed = consoleManifest(manifestOf({ ownerKey: true }));

  expect(readerMay({ role: "member", keyed: true }, member)).toBe(true);
  expect(readerMay({ role: "member", keyed: true }, administrator)).toBe(false);
  expect(readerMay({ role: "administrator", keyed: false }, administrator)).toBe(true);
  expect(readerMay({ role: "administrator", keyed: false }, keyed)).toBe(false);
});

test("the relay lets through the API prefix, the module and the stylesheet, and a share page stands below the screen", () => {
  const manifest = consoleManifest(manifestOf({ apiPrefix: "/screen", stylesheet: "/console/bundle.css" }));

  expect(relayedPath(manifest, "/screen/items")).toBe(true);
  expect(relayedPath(manifest, "/screen")).toBe(true);
  expect(relayedPath(manifest, "/screens")).toBe(false);
  expect(relayedPath(manifest, "/console/bundle.css")).toBe(true);
  expect(relayedPath(manifest, "/console/words")).toBe(false);
  expect(sharePage(manifest, "/unit-a/share/token-a")).toBe(true);
  expect(sharePage(manifest, "/unit-a/sharing")).toBe(false);
  expect(screenOf({ manifest, unit, words: {} }, "/base/").module).toBe("/base/api/unit-a/console/bundle.js");
});

test("the relay lets through a route the manifest relays by its method and path, beside what its prefix lets through", () => {
  const manifest = consoleManifest(manifestOf({ apiPrefix: "/screen", relays: [{ method: "POST", path: "/readings" }] }));

  expect(relayedCall(manifest, "POST", "/readings")).toBe(true);
  expect(relayedCall(manifest, "post", "/readings")).toBe(true);
  expect(relayedCall(manifest, "GET", "/readings")).toBe(false);
  expect(relayedCall(manifest, "POST", "/readings/kept")).toBe(false);
  expect(relayedCall(manifest, "GET", "/screen/items")).toBe(true);
});
