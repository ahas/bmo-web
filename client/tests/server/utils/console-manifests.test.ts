import { afterAll, expect, test } from "bun:test";

import { LAYER_BOUND, LAYER_RANGE, LAYER_VERSION, consoleManifest } from "bmo-ui/shared/console-manifest";

import { askedBundle, attachBundles, movedPage, namedUnits, readerMay, relayedCall, relayedPath, screenOf, sharePage, withoutConflicts } from "../../../apps/web/server/utils/console-manifests";
import { manifestFields } from "../../support/console-manifest";

// The manifests the units answer (docs/web.md, 「Screens a unit brings」): every unit the settings name is asked, a
// manifest that reads brings its bundle with its words, and two that clash bring none.

function manifestOf(fields: Record<string, unknown> = {}) {
  return manifestFields("unit-a", fields);
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

// What the console's log says while a call runs.
async function logged(run: () => Promise<void>): Promise<string[]> {
  const said: string[] = [];
  const error = console.error;

  console.error = (line: string) => void said.push(line);
  answers["/console/words"] = () => Response.json({ ko: { "unit-a": { title: "a" } } });

  try {
    await run();
  } finally {
    console.error = error;
  }

  return said;
}

// The line the log holds for a bundle built on a layer outside the console's range.
function outsideRange(name: string, layer: string): string {
  return `console bundles: ${name}'s bundle is left out: it is built on bmo-ui ${layer}, and the console runs bmo-ui ${LAYER_VERSION}, which attaches bundles built on bmo-ui ${LAYER_BOUND} up to its own`;
}

test("a manifest built on any release from the console's bound up to its own brings its bundle, the bound's included, and the log says nothing", async () => {
  const said = await logged(async () => {
    for (const layer of LAYER_RANGE) {
      answers["/console-manifest"] = () => Response.json(manifestOf({ layer }));
      expect((await askedBundle("UNIT_B", unit))?.manifest.layer).toBe(layer);
    }
  });

  expect(LAYER_RANGE).toContain("0.1.0-rev.23");
  expect(said).toEqual([]);
});

test("a manifest built on a release older than the bound brings none, and the log says so once, naming its layer, the console's and the bound", async () => {
  const said = await logged(async () => {
    answers["/console-manifest"] = () => Response.json(manifestOf({ layer: "0.1.0-rev.22" }));
    expect(await askedBundle("UNIT_C", unit)).toBeNull();
    expect(await askedBundle("UNIT_C", unit)).toBeNull();

    answers["/console-manifest"] = () => Response.json(manifestOf());
    expect((await askedBundle("UNIT_C", unit))?.manifest.layer).toBe(LAYER_VERSION);
  });

  expect(said).toEqual([outsideRange("UNIT_C", "0.1.0-rev.22")]);
});

test("a manifest built on a release newer than the console's, on a layer taken from its source or on a release outside the range's list brings none, each line naming the bound", async () => {
  const outside = ["0.1.0-rev.9999", `${LAYER_VERSION}+source`, "0.3.0"];
  const said = await logged(async () => {
    for (const layer of outside) {
      answers["/console-manifest"] = () => Response.json(manifestOf({ layer }));
      expect(await askedBundle("UNIT_D", unit)).toBeNull();
    }
  });

  expect(said).toEqual(outside.map((layer) => outsideRange("UNIT_D", layer)));
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

test("a former screen path counts as a screen path, so two manifests sharing one, or one's former path the other's screen path, both bring none", () => {
  const bundle = (fields: Record<string, unknown>) => ({ manifest: consoleManifest(manifestOf(fields)), unit, words: {} });
  const sharedFormer = withoutConflicts([
    bundle({ formerScreenPaths: ["/old"] }),
    bundle({ name: "unit-b", title: "unit-b.title", screenPath: "/unit-b", serviceName: "unit-b", formerScreenPaths: ["/old"] })
  ]);
  const formerOverOther = withoutConflicts([
    bundle({ formerScreenPaths: ["/unit-b"] }),
    bundle({ name: "unit-b", title: "unit-b.title", screenPath: "/unit-b", serviceName: "unit-b" }),
    bundle({ name: "unit-c", title: "unit-c.title", screenPath: "/unit-c", serviceName: "unit-c", formerScreenPaths: ["/older"] })
  ]);

  expect(sharedFormer).toEqual([]);
  expect(formerOverOther.map((one) => one.manifest.name)).toEqual(["unit-c"]);
});

test("a manifest whose service bears the name the console answers itself brings none, and the log says why", () => {
  const bundle = (fields: Record<string, unknown>) => ({ manifest: consoleManifest(manifestOf(fields)), unit, words: {} });
  const said: string[] = [];
  const error = console.error;

  console.error = (line: string) => said.push(line);
  try {
    const kept = withoutConflicts([bundle({ name: "unit-p", title: "unit-p.title", screenPath: "/unit-p", serviceName: "people" }), bundle({})]);

    expect(kept.map((one) => one.manifest.name)).toEqual(["unit-a"]);
  } finally {
    console.error = error;
  }

  expect(said).toEqual(["console bundles: the bundle unit-p is left out: its service is named people, which the console answers itself"]);
});

test("a page under a bundle's former screen path, read from the base path, moved to the same address under its screen path, base path and query kept", () => {
  attachBundles([
    { manifest: consoleManifest(manifestOf({ screenPath: "/artifact", formerScreenPaths: ["/archive"] })), unit, words: {} },
    { manifest: consoleManifest(manifestOf({ name: "unit-b", title: "unit-b.title", serviceName: "unit-b", screenPath: "/unit-b" })), unit, words: {} }
  ]);

  expect(movedPage("/bmo/", "/archive/share/5fjE9YBJ")).toBe("/bmo/artifact/share/5fjE9YBJ");
  expect(movedPage("/bmo/", "/archive")).toBe("/bmo/artifact");
  expect(movedPage("/bmo/", "/archive?kind=research")).toBe("/bmo/artifact?kind=research");
  expect(movedPage("/bmo/", "/archive/58?tab=sources&q=a%20b")).toBe("/bmo/artifact/58?tab=sources&q=a%20b");
  expect(movedPage("/", "/archive/58")).toBe("/artifact/58");
  expect(movedPage("", "/archive/58")).toBe("/artifact/58");

  for (const address of ["/artifact/58", "/archived", "/unit-b/archive", "/api/archive/1", "/_nuxt/archive.js", "/"]) {
    expect(movedPage("/bmo/", address)).toBeNull();
  }

  attachBundles([]);
  expect(movedPage("/bmo/", "/archive/58")).toBeNull();
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

test("a bundle that names a sidebar count is handed over as counted, never with an address the browser would read it at", () => {
  const counted = consoleManifest(manifestOf({ sidebarUnread: { path: "/summary", field: "unreadCount" } }));
  const plain = consoleManifest(manifestOf());

  expect(screenOf({ manifest: counted, unit, words: {} }, "/base/").counted).toBe(true);
  expect(screenOf({ manifest: plain, unit, words: {} }, "/base/").counted).toBe(false);
  expect(JSON.stringify(screenOf({ manifest: counted, unit, words: {} }, "/base/"))).not.toContain("/summary");
});

test("a bundle is handed over with the sidebar section its manifest names, an application where it names none", () => {
  const administration = consoleManifest(manifestOf({ sidebarSection: "administration" }));
  const plain = consoleManifest(manifestOf());

  expect(screenOf({ manifest: administration, unit, words: {} }, "/base/").sidebarSection).toBe("administration");
  expect(screenOf({ manifest: plain, unit, words: {} }, "/base/").sidebarSection).toBe("application");
});

test("the relay lets through a route the manifest relays by its method and path, beside what its prefix lets through", () => {
  const manifest = consoleManifest(manifestOf({ apiPrefix: "/screen", relays: [{ method: "POST", path: "/readings" }] }));

  expect(relayedCall(manifest, "POST", "/readings")).toBe(true);
  expect(relayedCall(manifest, "post", "/readings")).toBe(true);
  expect(relayedCall(manifest, "GET", "/readings")).toBe(false);
  expect(relayedCall(manifest, "POST", "/readings/kept")).toBe(false);
  expect(relayedCall(manifest, "GET", "/screen/items")).toBe(true);
});

test("the relay lets through a read of a file below the module's folder alone, never a change, a walk out or a file beside it", () => {
  const manifest = consoleManifest(manifestOf({ bundle: "/console/module-a.js", apiPrefix: "/screen" }));

  expect(relayedCall(manifest, "HEAD", "/console/chunks/chunk-a.js")).toBe(true);
  expect(relayedCall(manifest, "POST", "/console/chunks/chunk-a.js")).toBe(false);
  expect(relayedCall(manifest, "GET", "/console/chunks/../../secrets")).toBe(false);
  expect(relayedCall(manifest, "GET", "/consoles/chunk-a.js")).toBe(false);
  expect(relayedCall(manifest, "GET", "/chunk-a.js")).toBe(false);
});

test("the relay lets through no path that names a `.` or `..` segment or two slashes in a row", () => {
  const manifest = consoleManifest(manifestOf({ apiPrefix: "/screen", relays: [{ method: "POST", path: "/readings" }] }));
  const whole = consoleManifest(manifestOf({ apiPrefix: "/" }));

  expect(relayedPath(manifest, "/screen/../secrets")).toBe(false);
  expect(relayedPath(manifest, "/screen/./items")).toBe(false);
  expect(relayedPath(manifest, "/screen//items")).toBe(false);
  expect(relayedPath(manifest, "/screen/items/")).toBe(true);
  expect(relayedPath(whole, "/../elsewhere")).toBe(false);
  expect(relayedPath(whole, "/")).toBe(true);
  expect(relayedCall(manifest, "POST", "/screen/../readings")).toBe(false);
});
