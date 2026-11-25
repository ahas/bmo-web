import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { wording } from "../../../apps/web/shared/wording";

import type { RouteEvent } from "../../support/nitro";

// What a unit's heads write from the console (docs/web.md, 「Access」 and 「System and organisation」; docs/accounts.md,
// 「Concurrent posts」, 「Acting」 and 「Roles and unit kinds」): a post given and taken, an acting head named and ended,
// and a company's roles and unit kinds written. Each route hands the signed-in login to the account service, which
// lets the administrator and the heads it names alone, and says its refusal in the pack's words. Who heads what is the
// service's own rule, tested with it; the stand-in answers as the service would for a head and a plain member.

const UNIT = "21";
const COMPANY = "1";
const PERSON = "30";
const HEAD = "11";
const MEMBER = "13";

const globals: Record<string, unknown> = globalThis;
let reader = HEAD;

globalsRestoredAfter(["signedInUser"]);
globals.signedInUser = async () => ({ id: Number(reader), name: `member-${reader}`, administrator: false });

// What the service answers each write the head makes, by its method and path.
const written: Record<string, () => Response> = {
  [`PUT /units/${UNIT}/posts/${PERSON}`]: () => answer({ unit: Number(UNIT), role: null, head: false }),
  [`DELETE /units/${UNIT}/posts/${PERSON}`]: () => new Response(null, { status: 204 }),
  [`PUT /units/${UNIT}/acting`]: () => answer({ user: PERSON, until: 4_102_444_800_000, by: HEAD, at: 0 }),
  [`DELETE /units/${UNIT}/acting`]: () => new Response(null, { status: 204 }),
  [`PUT /companies/${COMPANY}/roles`]: () => answer({ roles: [{ key: "lead", name: "lead", place: 0 }] }),
  [`PUT /companies/${COMPANY}/unit-kinds`]: () => answer({ kinds: [{ key: "team", name: "team" }] })
};

const service = standIn(
  "WEB_SERVER",
  (call) => {
    const reply = written[`${call.method} ${call.path}`];

    if (reply === undefined) return answer({ code: "not-found", error: "no such route" }, 404);

    return call.headers?.["owner-key"] === HEAD ? reply() : answer({ code: "forbidden", error: "only the administrator and the unit's heads" }, 403);
  },
  { headers: true }
);

process.env.WEB_SERVER_TOKEN = "token";

const api = "../../apps/web/server/api/organization";
const routes: { name: string; asks: string; handler: (event: RouteEvent) => Promise<unknown>; event: RouteEvent }[] = [
  {
    name: "a post given",
    asks: `PUT /units/${UNIT}/posts/${PERSON}`,
    handler: await routeOf(`${api}/units/[unit]/posts/[user].put`),
    event: { params: { unit: UNIT, user: PERSON }, body: { role: null, head: false } }
  },
  { name: "a post taken", asks: `DELETE /units/${UNIT}/posts/${PERSON}`, handler: await routeOf(`${api}/units/[unit]/posts/[user].delete`), event: { params: { unit: UNIT, user: PERSON } } },
  {
    name: "an acting head named",
    asks: `PUT /units/${UNIT}/acting`,
    handler: await routeOf(`${api}/units/[unit]/acting.put`),
    event: { params: { unit: UNIT }, body: { user: PERSON, until: 4_102_444_800_000 } }
  },
  { name: "an acting head ended", asks: `DELETE /units/${UNIT}/acting`, handler: await routeOf(`${api}/units/[unit]/acting.delete`), event: { params: { unit: UNIT } } },
  {
    name: "a company's roles written",
    asks: `PUT /companies/${COMPANY}/roles`,
    handler: await routeOf(`${api}/companies/[company]/roles.put`),
    event: { params: { company: COMPANY }, body: { roles: [{ key: "lead", name: "lead" }] } }
  },
  {
    name: "a company's unit kinds written",
    asks: `PUT /companies/${COMPANY}/unit-kinds`,
    handler: await routeOf(`${api}/companies/[company]/unit-kinds.put`),
    event: { params: { company: COMPANY }, body: { kinds: [{ key: "team", name: "team" }] } }
  }
];

describe("a head's write from the console", () => {
  test("by a head goes through, the service asked as the head's login", async () => {
    reader = HEAD;

    for (const route of routes) {
      service.asked.length = 0;

      expect({ route: route.name, status: (await asked(route.handler, route.event)).status }).toEqual({ route: route.name, status: 200 });
      expect(service.asked.map((call) => [`${call.method} ${call.path}`, call.headers?.["owner-key"]])).toEqual([[route.asks, HEAD]]);
    }
  });

  test("by a plain member is refused in the pack's words", async () => {
    reader = MEMBER;

    for (const route of routes) {
      const refused = await asked(route.handler, route.event);

      expect({ route: route.name, status: refused.status, message: refused.message }).toEqual({ route: route.name, status: 403, message: wording("organization.error.head_only") });
    }
  });
});
