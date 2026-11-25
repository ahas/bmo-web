import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { wording } from "../../../apps/web/shared/wording";

import type { CompanyBmoView, OwnBmoView } from "../../../apps/web/shared/bmo-profile";

// The console's BMO profile routes (docs/web.md, 「System and organisation」, its BMO tab, and 「Settings」, its own-BMO section):
// each hands the signed-in login to the account service, which decides (docs/accounts.md, 「A person's BMO profile」),
// and says its refusal in the pack's words: a person who may not personalise their BMO is refused their own profile,
// and a member who heads no company its default.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["signedInUser"]);
globals.signedInUser = async () => ({ id: 12, name: "member-d", administrator: false });

const STANDING = {
  personalize: false,
  name: { from: "deployment" },
  callNames: { from: "deployment", callNames: [] },
  persona: { from: "deployment" },
  picture: { from: "deployment" },
  own: { name: "Kept", callNames: [], picture: false }
};

const service = standIn(
  "WEB_SERVER",
  (call) => {
    if (call.method === "GET" && call.path === "/users/12/agent") return answer(STANDING);
    if (call.method === "PUT" && call.path === "/users/12/agent") return answer({ code: "personalize-withheld", error: "the user may not personalise their BMO" }, 403);
    if (call.method === "PUT" && call.path === "/companies/1/agent") return answer({ code: "forbidden", error: "only the administrator and the company's heads" }, 403);

    return answer({ code: "not-found", error: "no route" }, 404);
  },
  { headers: true }
);

standIn("AGENCY", (call) => {
  if (call.method === "GET" && call.path === "/supervisors") return answer({ items: [{ name: "u12", label: "member-d", ownerAccount: 12 }], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});

process.env.WEB_SERVER_TOKEN = "token";

const readOwn = await routeOf<OwnBmoView>("../../apps/web/server/api/account/agent.get");
const saveOwn = await routeOf<OwnBmoView>("../../apps/web/server/api/account/agent.put");
const saveDefault = await routeOf<CompanyBmoView>("../../apps/web/server/api/organization/companies/[company]/agent.put");

describe("a person who may not personalise their BMO", () => {
  test("reads the profile standing for them as not theirs to change, with their own parts as kept", async () => {
    const read = await asked(readOwn, {});

    expect(read.status).toBe(200);
    expect(read.answer).toMatchObject({ personalize: false, hasBmo: true, name: { value: null, from: "deployment" }, own: { name: "Kept" } });
  });

  test("is refused their own profile in the pack's words, the account service asked as their login", async () => {
    service.asked.length = 0;

    const saved = await asked(saveOwn, { body: { name: "Mine", callNames: ["mine"], persona: null } });
    const call = service.asked.find((one) => one.method === "PUT");

    expect(saved.status).toBe(403);
    expect(saved.message).toBe(wording("bmo_profile.error.withheld"));
    expect(call?.headers?.["owner-key"]).toBe("12");
    expect(call?.headers?.["owner-role"]).toBe("member");
  });
});

describe("a member who heads no company", () => {
  test("is refused the company's default in the pack's words", async () => {
    const saved = await asked(saveDefault, { params: { company: "1" }, body: { name: "Dear", callNames: [] } });

    expect(saved.status).toBe(403);
    expect(saved.message).toBe(wording("bmo_profile.error.forbidden"));
  });
});
