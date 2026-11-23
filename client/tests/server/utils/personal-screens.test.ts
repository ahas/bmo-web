import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { LAYER_VERSION, consoleManifest } from "bmo-ui/shared/console-manifest";

import { withoutConflicts } from "../../../apps/web/server/utils/console-manifests";
import { personalBundle, personalPageService, readerScreen, readerScreens, relayPersonal } from "../../../apps/web/server/utils/personal-screens";
import { manifestFields } from "../../support/console-manifest";
import { scratchDir } from "../../support/scratch";

// A reader's own screens (docs/web.md, 「A reader's own screens」): the console asks the agency for the reader's screen
// session and reads the tool host's app face under it, assembling each screen's manifest in the readers' own
// namespace; a file is relayed under the digest it is addressed by and kept for good by the browser; a call of the
// screen's tool goes to the app face's call of that tool; a token the host no longer takes is asked for again; and a
// unit's manifest standing in the namespace is left out. The agency and the tool host are stood in.

const DIGEST = "a".repeat(64);
const MODULE = "export default { routes: [] };\n";
const scratch = scratchDir("bmo-web-personal-screens-");
const socket = join(scratch, "mcp-host.sock");
const issued: string[] = [];
const faced: { path: string; token: string | null; body: string }[] = [];
let lapsed = new Set<string>();

function screen(tool: string, layer: string = LAYER_VERSION) {
  const name = `my-${tool.replaceAll("_", "-")}`;

  return {
    tool,
    version: "100-abc",
    name,
    screenPath: `/my/${tool.replaceAll("_", "-")}`,
    title: `${name}.title`,
    icon: "i-material-symbols-note",
    layer,
    words: { en: { [name]: { title: "Notes" } } },
    digest: DIGEST,
    module: `/screens/${tool}/${DIGEST}/module.js`,
    stylesheet: null
  };
}

const agency = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    const account = /^\/personal-apps\/([^/]+)\/screen-session$/.exec(path)?.[1];

    if (account === undefined || request.method !== "POST") return Response.json({ code: "not-found" }, { status: 404 });
    if (account === "404") return Response.json({ code: "no-runner", error: "no PC" }, { status: 409 });

    const token = `token-${account}-${issued.length}`;

    issued.push(token);

    return Response.json({ token, expiresAt: Date.now() + 600_000 }, { status: 201 });
  }
});

const host = Bun.serve({
  unix: socket,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const token = request.headers.get("authorization")?.replace("Bearer ", "") ?? null;

    faced.push({ path, token, body: request.method === "POST" ? await request.text() : "" });

    if (token === null || lapsed.has(token)) return Response.json({ code: "unauthorized" }, { status: 401 });
    if (path === "/screens") return Response.json({ items: [screen("weekly_notes"), screen("stale", "0.0.1-rev.1")], reached: true });
    if (path === `/screens/weekly_notes/${DIGEST}/module.js`) {
      return new Response(MODULE, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "private, max-age=31536000, immutable" } });
    }
    if (path === "/screens/weekly_notes/calls") return Response.json({ namespace: "my", name: "weekly_notes", result: { content: [{ type: "text", text: "kept" }] }, spentMs: 1 });

    return Response.json({ code: "not-found" }, { status: 404 });
  }
});

const reader = { name: "reader", id: 7, administrator: false };

beforeAll(() => {
  process.env.AGENCY_ADDRESS = `http://127.0.0.1:${agency.port}`;
  process.env.AGENCY_TOKEN = "agency-token";
  process.env.BMO_MCP_HOST_SOCKET = socket;
});

afterAll(() => {
  void agency.stop(true);
  void host.stop(true);
});

describe("a reader's own screens", () => {
  test("are read under the reader's screen session, in the readers' own namespace, a layer outside the range left out", async () => {
    const screens = await readerScreens(reader, true);

    expect(screens.map((one) => one.manifest.name)).toEqual(["my-weekly-notes"]);

    const [own] = screens;

    expect(own!.manifest).toMatchObject({
      screenPath: "/my/weekly-notes",
      serviceName: "my-weekly-notes",
      title: "my-weekly-notes.title",
      bundle: `/files/${DIGEST}/module.js`,
      role: "member",
      ownerKey: true
    });
    expect(own!.manifest.stylesheet).toBeUndefined();
    expect(own!.reached).toBe(true);
    expect(faced.at(-1)).toMatchObject({ path: "/screens", token: issued.at(-1) });
    // The session is kept: a second reading asks the agency for none.
    await readerScreens(reader, true);
    expect(issued.length).toBe(1);
    // A login with no user, and an account the agency issues no session for, hold none.
    expect(await readerScreens({ ...reader, id: null })).toEqual([]);
    expect(await readerScreens({ ...reader, id: 404 }, true)).toEqual([]);
  });

  test("relay a file under its digest, kept for good, and a call of the screen's own tool", async () => {
    const own = (await readerScreen(reader, "my-weekly-notes"))!;
    const file = (await relayPersonal(reader, own, "GET", ["files", DIGEST, "module.js"], async () => ""))!;

    expect(file.status).toBe(200);
    expect(await file.text()).toBe(MODULE);
    expect(file.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");

    const called = (await relayPersonal(reader, own, "POST", ["tools", "weekly_notes"], async () => '{"week":"47"}'))!;

    expect(called.status).toBe(200);
    expect(faced.at(-1)).toMatchObject({ path: "/screens/weekly_notes/calls", body: JSON.stringify({ name: "weekly_notes", input: { week: "47" } }) });
    expect(await relayPersonal(reader, own, "DELETE", ["tools", "weekly_notes"], async () => "")).toBeNull();
    expect(await relayPersonal(reader, own, "GET", ["words"], async () => "")).toBeNull();
    expect((await relayPersonal(reader, own, "POST", ["tools", "weekly_notes"], async () => "{not json"))!.status).toBe(400);
  });

  test("ask for a session again once where the host no longer takes the token", async () => {
    lapsed = new Set(issued);

    const before = issued.length;

    expect((await readerScreens(reader, true)).length).toBe(1);
    expect(issued.length).toBe(before + 1);
    lapsed = new Set();
  });

  test("leave out a screen outside the namespace, and a unit's manifest standing in it", () => {
    expect(typeof personalBundle({ ...screen("notes"), name: "notes", screenPath: "/notes" }, true)).toBe("string");
    expect(personalPageService("/console", "https://console.example/console/my/weekly-notes/week?x=1")).toBe("my-weekly-notes");
    expect(personalPageService("/console", "https://console.example/console/mail")).toBeNull();

    const unit = (name: string, fields: Record<string, unknown> = {}) => ({ manifest: consoleManifest(manifestFields(name, fields)), unit: { address: "", token: null }, words: {} });
    const kept = withoutConflicts([unit("unit-a"), unit("my-mail", { serviceName: "mail-x", screenPath: "/mail-x" }), unit("u-b", { serviceName: "u-b", screenPath: "/my/b" })]);

    expect(kept.map((one) => one.manifest.name)).toEqual(["unit-a"]);
  });
});
