import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { wording } from "../../../apps/web/shared/wording";

// A person marked left from the console (docs/web.md, 「Organisation」; docs/accounts.md, 「A person who leaves」): the
// route hands the signed-in login to the account service, which lets the administrator and the person's heads alone,
// and says its refusal in the pack's words. Who heads whom is the service's own rule, tested with it; the stand-in
// answers as the service would for a head of the person's unit, a head of another unit and a plain member.

const PERSON = "30";
const HEAD_OF_UNIT = "11";
const HEAD_OF_OTHER_UNIT = "12";
const MEMBER = "13";

const globals: Record<string, unknown> = globalThis;
let reader = HEAD_OF_UNIT;

globalsRestoredAfter(["signedInUser"]);
globals.signedInUser = async () => ({ id: Number(reader), name: `member-${reader}`, administrator: false });

const service = standIn(
  "WEB_SERVER",
  (call) => {
    if (call.method === "POST" && call.path === `/users/${PERSON}/leave`) {
      return call.headers?.["owner-key"] === HEAD_OF_UNIT ? new Response(null, { status: 204 }) : answer({ code: "forbidden", error: "only the administrator and the user's heads" }, 403);
    }

    return answer({ code: "not-found", error: "no such user" }, 404);
  },
  { headers: true }
);

process.env.WEB_SERVER_TOKEN = "token";

const markLeft = await routeOf<void>("../../apps/web/server/api/organization/users/[user]/leave.post");

describe("a person marked left from the console", () => {
  test("by a head of their unit goes through, the service asked as the head's login", async () => {
    reader = HEAD_OF_UNIT;
    service.asked.length = 0;

    expect((await asked(markLeft, { params: { user: PERSON } })).status).toBe(200);
    expect(service.asked.map((call) => [call.path, call.headers?.["owner-key"], call.headers?.["owner-role"]])).toEqual([[`/users/${PERSON}/leave`, HEAD_OF_UNIT, "member"]]);
  });

  test("by a head of another unit or a plain member is refused in the pack's words", async () => {
    for (const one of [HEAD_OF_OTHER_UNIT, MEMBER]) {
      reader = one;

      const refused = await asked(markLeft, { params: { user: PERSON } });

      expect({ reader: one, status: refused.status, message: refused.message }).toEqual({ reader: one, status: 403, message: wording("organization.error.leave_head_only") });
    }
  });
});
