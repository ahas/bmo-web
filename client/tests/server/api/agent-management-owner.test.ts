import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// Agent management asks the agency as the person signed in (docs/boundary.md, 「Calls the console makes」): every call
// the routes of its five tabs make, read or change, carries the member in `Owner-Key` and `Owner-Role`, so the agency
// holds each to that person's console section of the part. A refusal the agency gives all the same reaches the screen
// as a refusal in the pack's words, and a permission it could not read as the agency being unable to answer now.

const MEMBER = 12;

// The console section the account service withholds from this member, as one holding every other part.
let refused: string | null = null;
// Whether the account service could answer no permission at all.
let unchecked = false;

// The member's console sections as the account service answers them, which the console judges each call by before it
// reaches the agency (docs/web.md, 「Access」).
standIn("WEB_SERVER", (call) => {
  if (unchecked) return answer({ code: "failed", error: "the account service is down" }, 503);
  if (!/^\/users\/[^/]+\/sections/.test(call.path)) return answer({ code: "not-found", error: "no such route" }, 404);

  const sections = ["supervisors", "roles", "repositories", "models", "model-files"].map((section) => ({
    section,
    read: section !== refused,
    write: section !== refused
  }));

  return answer({ sections });
});

const agency = standIn(
  "AGENCY",
  (call) => {
    const path = call.path.split("?")[0] ?? "";

    if (call.method === "DELETE") return new Response(null, { status: 204 });
    if (path === "/supervisors") return answer({ items: [{ name: `u${MEMBER}`, ownerAccount: MEMBER }], more: false });
    if (path === "/roles") return answer({ roles: [], bundles: [], skills: [], lines: [] });
    if (path === "/model-catalogue") return answer({ entries: [], uses: [] });
    if (path.startsWith("/supervisors/") && path.endsWith("/settings")) return answer({ agent: `u${MEMBER}`, settings: {}, system: {} });

    return answer({ items: [], more: false });
  },
  { headers: true }
);

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireUserSession"]);
globals.requireUserSession = async () => ({ sid: "session-a", user: { id: MEMBER, name: "member-a" }, administrator: false });

const route = async (path: string) => await routeOf<unknown>(`../../apps/web/server/api/${path}`);

// One read or change of each tab, with the request that makes it.
const CALLS: { name: string; handler: (event: RouteEvent) => Promise<unknown>; event: RouteEvent }[] = [
  { name: "the agent list", handler: await route("agents.get"), event: {} },
  { name: "the roles' runs", handler: await route("agent-runs.get"), event: {} },
  { name: "the supervisors", handler: await route("supervisors.get"), event: {} },
  { name: "a supervisor's settings saved", handler: await route("supervisors/[name]/settings.patch"), event: { params: { name: `u${MEMBER}` }, body: { referenceOn: true } } },
  { name: "the roles", handler: await route("roles.get"), event: {} },
  { name: "a role's sessions", handler: await route("roles/[name]/sessions.get"), event: { params: { name: "role-a" } } },
  { name: "a role removed", handler: await route("roles/[name].delete"), event: { params: { name: "role-a" } } },
  { name: "the repositories", handler: await route("repositories.get"), event: {} },
  { name: "a repository removed", handler: await route("repositories/[name].delete"), event: { params: { name: "repo-a" } } },
  { name: "the registered models", handler: await route("models.get"), event: {} },
  { name: "a model registered", handler: await route("models.post"), event: { body: { key: "registered::model-a", model: "model-a" } } },
  { name: "a model taken away", handler: await route("models/[modelKey].delete"), event: { params: { modelKey: "registered::model-a" } } },
  { name: "the model files", handler: await route("model-catalogue.get"), event: {} }
];

describe("agent management, asked of the agency", () => {
  for (const call of CALLS) {
    test(`asks ${call.name} as the member signed in`, async () => {
      refused = null;
      unchecked = false;
      agency.asked.length = 0;

      await asked(call.handler, call.event);

      // The console's own read of whose row a change names goes as the deployment's; every other call carries the member.
      const forMember = agency.asked.filter((one) => one.headers?.["owner-key"] !== undefined);

      expect(forMember.length).toBeGreaterThan(0);
      expect(forMember.map((one) => ({ path: one.path, key: one.headers?.["owner-key"], role: one.headers?.["owner-role"] }))).toEqual(
        forMember.map((one) => ({ path: one.path, key: String(MEMBER), role: "member" }))
      );
    });
  }

  test("refuses a part the member does not hold before the agency is asked, and still reads the part they do", async () => {
    refused = "model-files";
    unchecked = false;

    const files = await asked(CALLS.find((one) => one.name === "the model files")!.handler, {});
    const models = await asked(CALLS.find((one) => one.name === "the registered models")!.handler, {});

    expect({ status: files.status, message: files.message }).toEqual({ status: 403, message: wording("agents.error.agency_forbidden") });
    expect(models.status).toBe(200);
  });

  test("says no access where the member's permission could not be read", async () => {
    refused = null;
    unchecked = true;

    const models = await asked(CALLS.find((one) => one.name === "the registered models")!.handler, {});

    expect({ status: models.status, message: models.message }).toEqual({ status: 503, message: wording("agents.error.agency_access_unchecked") });
  });
});
