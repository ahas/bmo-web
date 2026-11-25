import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { wording } from "../../../apps/web/shared/wording";

import type { RouteEvent } from "../../support/nitro";

// The organisation screen's apps tab with the platform chosen (docs/web.md, 「Organisation」, the apps tab;
// docs/accounts.md, 「An app's two settings」): every app read off the platform's own links with the defaults its
// publisher declared; the platform's own word written; and the recall, which turns the app's on off under the
// platform's lock and takes away every platform rule turning it on, lifted by taking the lock and the word away. Every
// route is the administrator's alone.

const APP = "app-a";
const ON = `app.${APP}.on`;
const OFFERED = `app.${APP}.offered`;

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireAdministrator"]);

const kind = (key: string, fallback: boolean) => ({
  key,
  declaredBy: "unit-a",
  description: "",
  shape: "flag",
  choices: [],
  mode: "nearest",
  default: fallback,
  rules: true,
  levels: ["platform", "unit", "person"],
  unitPermission: "manage",
  personWriter: "both",
  personRaises: false
});

const entry = (key: string, value: unknown, delegation: string, rules: { who: string; value: unknown }[]) => ({ key, link: "platform", value, delegation, rules, lockedBy: null, writable: true });

// What the platform's links hold, by kind.
const links: Record<string, ReturnType<typeof entry>> = {
  [ON]: entry(ON, null, "inherit", [
    { who: "person:9", value: true },
    { who: "unit:5", value: false }
  ]),
  [OFFERED]: entry(OFFERED, null, "inherit", [
    { who: "unit:7", value: true },
    { who: "group:3", value: true }
  ])
};

const service = standIn("WEB_SERVER", (call) => {
  if (call.method === "GET" && call.path === "/chain/kinds") return answer({ kinds: [kind(OFFERED, false), kind(ON, true), kind("other.kind", true)] });

  const link = /^\/chain\/kinds\/([^/]+)\/links\/platform(?:\/(value|rules|delegation))?$/.exec(call.path);

  if (link !== null && links[link[1]!] !== undefined) return answer(links[link[1]!]);

  return answer({ code: "not-found", error: "no such route" }, 404);
});

process.env.WEB_SERVER_TOKEN = "token";

const api = "../../apps/web/server/api/organization/platform/apps";
const list = await routeOf(`${api}.get`);
const change = await routeOf(`${api}/[app].put`);
const recall = await routeOf(`${api}/[app]/recall.post`);
const lift = await routeOf(`${api}/[app]/recall.delete`);

const writes = () => service.asked.filter((call) => call.method === "PUT").map((call) => [call.path, call.body]);

describe("the platform's apps", () => {
  test("stand as the platform's own links say, with the declared defaults and no company named", async () => {
    const read = (await list({} as RouteEvent)) as unknown[];

    expect(read).toEqual([
      {
        app: APP,
        title: null,
        icon: null,
        offered: { value: false, own: null, declared: false },
        on: { value: true, own: null, declared: true },
        locks: false,
        recalled: false
      }
    ]);
  });

  test("the platform's own word is written on the links it names", async () => {
    service.asked.length = 0;

    await change({ params: { app: APP }, body: { offered: true, on: null, locks: true } } as RouteEvent);

    expect(writes()).toEqual([
      [`/chain/kinds/${OFFERED}/links/platform/value`, { value: true }],
      [`/chain/kinds/${ON}/links/platform/value`, { value: null }],
      [`/chain/kinds/${ON}/links/platform/delegation`, { delegation: "lock" }]
    ]);
  });

  test("a recall turns the app off under the platform's lock, taking away the rules that turn it on", async () => {
    service.asked.length = 0;

    await recall({ params: { app: APP } } as RouteEvent);

    expect(writes()).toEqual([
      [`/chain/kinds/${ON}/links/platform/value`, { value: false }],
      [`/chain/kinds/${ON}/links/platform/rules`, { rules: [{ who: "unit:5", value: false }] }],
      [`/chain/kinds/${ON}/links/platform/delegation`, { delegation: "lock" }]
    ]);
  });

  test("a recall lifted takes the lock and the platform's word away", async () => {
    service.asked.length = 0;

    await lift({ params: { app: APP } } as RouteEvent);

    expect(writes()).toEqual([
      [`/chain/kinds/${ON}/links/platform/delegation`, { delegation: "inherit" }],
      [`/chain/kinds/${ON}/links/platform/value`, { value: null }]
    ]);
  });

  test("a recalled app reads so", async () => {
    links[ON] = entry(ON, false, "lock", [{ who: "unit:5", value: false }]);

    try {
      const read = (await list({} as RouteEvent)) as { recalled: boolean; locks: boolean; on: unknown }[];

      expect(read[0]).toMatchObject({ recalled: true, locks: true, on: { value: false, own: false, declared: true } });
    } finally {
      links[ON] = entry(ON, null, "inherit", []);
    }
  });

  test("a key no app can carry is refused before anything is written", async () => {
    service.asked.length = 0;

    const refused = await asked(recall, { params: { app: "Not An App" } });

    expect({ status: refused.status, message: refused.message }).toEqual({ status: 400, message: wording("apps.error.no_app") });
    expect(writes()).toEqual([]);
  });

  test("are the administrator's alone", async () => {
    globals.requireAdministrator = async () => {
      throw Object.assign(new Error(wording("common.error.administrator_only")), { statusCode: 403 });
    };
    service.asked.length = 0;

    for (const [handler, event] of [
      [list, {}],
      [change, { params: { app: APP }, body: { on: false } }],
      [recall, { params: { app: APP } }],
      [lift, { params: { app: APP } }]
    ] as const) {
      expect((await asked(handler, event)).status).toBe(403);
    }

    expect(service.asked).toEqual([]);
  });
});
