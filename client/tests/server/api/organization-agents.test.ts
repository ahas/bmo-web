import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { wording } from "../../../apps/web/shared/wording";

import type { RouteEvent } from "../../support/nitro";

// The organisation screen's agents tab and a person's own reading of the chain (docs/web.md, 「Organisation」, the
// agents tab; 「Settings」, the supply and own-BMO sections): a unit's instructions, persona's choice and repository
// management read off the chain as the signed-in head and written on its routes in their name; the unit's own
// repositories read off the agency as the deployment's own and added in the head's name; and the supply sources and
// the persona's choice standing for a person, with the unit that decided each named. Who may write a link is the
// account service's rule; the stand-in answers its writers as it would.

const UNIT = 21;
const COMPANY = 1;
const HEAD = "11";
const MEMBER = "13";

const globals: Record<string, unknown> = globalThis;
let reader = HEAD;

globalsRestoredAfter(["signedInUser"]);
globals.signedInUser = async () => ({ id: Number(reader), name: `member-${reader}`, administrator: false });

const entry = (kind: string, link: string, value: unknown, delegation = "inherit", lockedBy: string | null = null) => ({ kind, link, value, delegation, rules: [], writable: lockedBy === null, lockedBy });

// What a unit's link holds of each kind, and what each kind resolves to, by kind.
const unitLinks: Record<string, ReturnType<typeof entry>> = {
  "agency.org-instructions": entry("agency.org-instructions", `unit:${UNIT}`, "Keep the team's records in the team's folder."),
  "agency.persona": entry("agency.persona", `unit:${UNIT}`, null, "lock"),
  "repositories.manage": entry("repositories.manage", `unit:${UNIT}`, false)
};
const resolutions: Record<string, unknown> = {
  "agency.org-instructions": {
    kind: "agency.org-instructions",
    subject: `unit:${UNIT}`,
    path: [],
    layers: [
      { link: "platform", value: "Never reach for another company's systems." },
      { link: `unit:${COMPANY}`, value: "" },
      { link: `unit:${UNIT}`, value: "Keep the team's records in the team's folder." }
    ]
  },
  "agency.persona": { kind: "agency.persona", subject: `unit:${UNIT}`, path: [], layers: [{ link: `unit:${COMPANY}`, value: ["none"] }], value: ["none"], from: `unit:${COMPANY}` },
  "repositories.manage": { kind: "repositories.manage", subject: `unit:${UNIT}`, path: [], layers: [{ link: `unit:${UNIT}`, value: false }], value: false, from: `unit:${UNIT}` }
};
// What each kind resolves to for the member, as their own settings read it.
const personal: Record<string, unknown> = {
  "supply.personal": { kind: "supply.personal", subject: `person:${MEMBER}`, path: [], layers: [{ link: `unit:${UNIT}`, value: false }], value: false, link: { link: `person:${MEMBER}`, mayChange: false } },
  "supply.platform": { kind: "supply.platform", subject: `person:${MEMBER}`, path: [], layers: [], value: true, link: { link: `person:${MEMBER}`, mayChange: false } },
  "supply.organisation": { kind: "supply.organisation", subject: `person:${MEMBER}`, path: [], layers: [], value: false, link: { link: `person:${MEMBER}`, mayChange: false } },
  "agency.persona": {
    kind: "agency.persona",
    subject: `person:${MEMBER}`,
    path: [],
    layers: [{ link: `unit:${COMPANY}`, value: ["none"] }],
    value: ["none"],
    from: `unit:${COMPANY}`,
    lockedBy: `unit:${COMPANY}`,
    link: { link: `person:${MEMBER}`, mayChange: false, lockedBy: `unit:${COMPANY}` }
  }
};
const UNIT_NAMES: Record<string, string> = { [String(UNIT)]: "Team", [String(COMPANY)]: "Company" };

const service = standIn(
  "WEB_SERVER",
  (call) => {
    const resolve = /^\/chain\/kinds\/([^/]+)\/resolve\?(.*)$/.exec(call.path);

    if (call.method === "GET" && resolve !== null) {
      const kind = decodeURIComponent(resolve[1]!);

      return answer(new URLSearchParams(resolve[2]).has("person") ? personal[kind] : resolutions[kind]);
    }

    const link = /^\/chain\/kinds\/([^/]+)\/links\/([^/]+)(?:\/(value|delegation))?$/.exec(call.path);

    if (link !== null) {
      const held = unitLinks[decodeURIComponent(link[1]!)];
      const writer = call.headers?.["owner-key"] === HEAD || (call.headers?.["owner-key"] === MEMBER && decodeURIComponent(link[2]!) === `person:${MEMBER}`);

      if (!writer) return answer({ code: "forbidden", error: "not a writer of the link" }, 403);
      if (link[3] !== undefined && held?.lockedBy !== null) return answer({ code: "locked", error: "a link above locks it" }, 409);

      return answer(held ?? entry(decodeURIComponent(link[1]!), decodeURIComponent(link[2]!), null));
    }

    const unit = /^\/units\/(\d+)$/.exec(call.path);

    if (call.method === "GET" && unit !== null) return answer({ id: Number(unit[1]), name: UNIT_NAMES[unit[1]!], heads: [], members: [], left: [], concurrent: [], acting: [] });

    return answer({ code: "not-found", error: "no such route" }, 404);
  },
  { headers: true }
);

const repository = (name: string, ownerUnit: number | null) => ({ name, label: null, icon: null, ownerAccount: null, ownerUnit, path: `/work/${name}`, nodeName: null, supportCount: "auto", prefixDocuments: [], preamble: null, rules: null, devCommand: null, pin: null });

const agency = standIn(
  "AGENCY",
  (call) => {
    if (call.method === "GET" && call.path === "/repositories") return answer({ items: [repository("team-tools", UNIT), repository("platform-tools", null), repository("other-team", 99)], more: false });
    if (call.method === "POST" && call.path === "/repositories") return answer(repository(String(call.body?.name), UNIT), 201);
    if (call.method === "DELETE" && call.path === "/repositories/team-tools") return new Response(null, { status: 204 });

    return answer({ code: "not-found", error: "no such route" }, 404);
  },
  { headers: true }
);

process.env.WEB_SERVER_TOKEN = "token";
process.env.AGENCY_TOKEN = "token";

const api = "../../apps/web/server/api";
const settings = await routeOf(`${api}/organization/units/[unit]/agent-settings.get`);
const change = await routeOf(`${api}/organization/units/[unit]/agent-settings.put`);
const repositories = await routeOf(`${api}/organization/units/[unit]/repositories.get`);
const addRepository = await routeOf(`${api}/organization/units/[unit]/repositories.post`);
const sources = await routeOf(`${api}/account/supply-sources.get`);
const persona = await routeOf(`${api}/account/agent-persona.get`);
const setPersona = await routeOf(`${api}/account/agent-persona.put`);

const writes = () => service.asked.filter((call) => call.method === "PUT").map((call) => [call.path, call.body, call.headers?.["owner-key"]]);

describe("the organisation's agent settings", () => {
  test("stand at the unit as its head reads them: its own instructions and the texts above, its persona's choice and repository management", async () => {
    reader = HEAD;

    expect(await settings({ params: { unit: String(UNIT) } } as RouteEvent)).toEqual({
      unit: UNIT,
      instructions: { own: "Keep the team's records in the team's folder.", above: ["Never reach for another company's systems."], delegation: "inherit", writable: true, lockedBy: null },
      persona: { own: null, stands: "none", delegation: "lock", writable: true, lockedBy: null },
      repositories: { own: false, stands: false, delegation: "inherit", writable: true, lockedBy: null }
    });
  });

  test("a choice is written on the chain in the head's name, the persona as its key and a lock as the delegation", async () => {
    reader = HEAD;
    service.asked.length = 0;

    await change({ params: { unit: String(UNIT) }, body: { setting: "persona", value: "own", delegation: "allow" } } as RouteEvent);
    await change({ params: { unit: String(UNIT) }, body: { setting: "instructions", value: "   " } } as RouteEvent);
    await change({ params: { unit: String(UNIT) }, body: { setting: "repositories", value: null } } as RouteEvent);

    expect(writes()).toEqual([
      [`/chain/kinds/agency.persona/links/unit%3A${UNIT}/value`, { value: ["own"] }, HEAD],
      [`/chain/kinds/agency.persona/links/unit%3A${UNIT}/delegation`, { delegation: "allow" }, HEAD],
      [`/chain/kinds/agency.org-instructions/links/unit%3A${UNIT}/value`, { value: null }, HEAD],
      [`/chain/kinds/repositories.manage/links/unit%3A${UNIT}/value`, { value: null }, HEAD]
    ]);
  });

  test("a value out of a setting's shape is refused before anything is written", async () => {
    service.asked.length = 0;

    for (const body of [{ setting: "persona", value: "loud" }, { setting: "repositories", value: "yes" }, { setting: "nothing", value: true }, { setting: "persona" }]) {
      expect({ body, status: (await asked(change, { params: { unit: String(UNIT) }, body })).status }).toEqual({ body, status: 400 });
    }

    expect(writes()).toEqual([]);
  });

  test("a reader who writes none of the unit's links is refused in the pack's words", async () => {
    reader = MEMBER;

    try {
      const refused = await asked(settings, { params: { unit: String(UNIT) } });

      expect({ status: refused.status, message: refused.message }).toEqual({ status: 403, message: wording("org_agents.error.forbidden") });
      expect((await asked(repositories, { params: { unit: String(UNIT) } })).status).toBe(403);
    } finally {
      reader = HEAD;
    }
  });

  // The owner an agency call carries is read once for its request and held on it (the console's agency client), so the
  // add's event holds the head's.
  test("the unit's repositories are the agency's rows it owns, and one is added under it in the head's name", async () => {
    reader = HEAD;
    agency.asked.length = 0;

    expect(await repositories({ params: { unit: String(UNIT) } } as RouteEvent)).toEqual([{ name: "team-tools", label: null, path: "/work/team-tools" }]);
    expect(agency.asked[0]!.headers?.["owner-key"]).toBeUndefined();

    await addRepository({ params: { unit: String(UNIT) }, body: { name: "team-site", label: " ", path: " /work/team-site " }, context: { agencyOwner: { "owner-key": HEAD, "owner-role": "member" } } } as unknown as RouteEvent);

    const added = agency.asked.find((call) => call.method === "POST")!;

    expect(added.body).toEqual({ name: "team-site", label: null, path: "/work/team-site", ownerUnit: UNIT });
    expect(added.headers?.["owner-key"]).toBe(HEAD);
  });
});

describe("a person's own reading of the chain", () => {
  test("names the unit that closed a supply source for them, the platform where it opens none, and nobody where the default stands", async () => {
    reader = MEMBER;

    expect(await sources({} as RouteEvent)).toEqual([
      { source: "personal", on: false, decided: { by: "unit", name: "Team" } },
      { source: "organisation", on: false, decided: { by: "platform" } },
      { source: "platform", on: true, decided: null }
    ]);
  });

  test("names the unit whose lock decides their persona, and its lock refuses their own word", async () => {
    reader = MEMBER;

    expect(await persona({} as RouteEvent)).toEqual({ on: false, own: null, decided: { by: "unit", name: "Company" } });

    unitLinks["agency.persona"] = entry("agency.persona", `person:${MEMBER}`, null, "inherit", `unit:${COMPANY}`);

    try {
      const refused = await asked(setPersona, { body: { on: true } });

      expect({ status: refused.status, message: refused.message }).toEqual({ status: 409, message: wording("org_agents.error.locked") });
    } finally {
      unitLinks["agency.persona"] = entry("agency.persona", `unit:${UNIT}`, null, "lock");
    }
  });
});
