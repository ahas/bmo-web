import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { PairingApproved } from "../../../packages/server-client/src/index";

// The join page's pairing approval (docs/web.md, 「The join page」; docs/accounts.md, 「Desktop pairing」): the code
// typed from the app's title bar handed on with the invitation and no sign-in, an empty one refused before the service
// is asked, and the service's refusals said in the pack's words.

const service = standIn("WEB_SERVER", (call) => {
  if (call.method === "POST" && call.path === "/invites/token-a/pairings/ABCD-EFGH/approve") return answer({ machine: "u5" });
  if (call.path === "/invites/token-active/pairings/ABCD-EFGH/approve") return answer({ code: "account-active", error: "active" }, 409);
  if (call.path === "/invites/token-a/pairings/ABCD-GONE/approve") return answer({ code: "pairing-closed", error: "closed" }, 410);

  return answer({ code: "not-found", error: "no pairing has this code" }, 404);
});

process.env.WEB_SERVER_TOKEN = "the token";

afterAll(() => {
  delete process.env.WEB_SERVER_TOKEN;
});

const pair = await routeOf<PairingApproved>("../../apps/web/server/api/join/[token]/pair.post");

describe("the join page's pairing approval", () => {
  test("hands the code on with the invitation and answers the machine", async () => {
    service.asked.length = 0;

    const approved = await asked(pair, { params: { token: "token-a" }, body: { code: " ABCD-EFGH " } });

    expect(approved.answer).toEqual({ machine: "u5" });
    expect(service.asked.map((call) => [call.method, call.path])).toEqual([["POST", "/invites/token-a/pairings/ABCD-EFGH/approve"]]);
  });

  test("refuses an empty code without asking the service", async () => {
    service.asked.length = 0;

    const refused = await asked(pair, { params: { token: "token-a" }, body: { code: "  " } });

    expect(refused.status).toBe(400);
    expect(refused.message).toBe(wording("join.error.code_empty"));
    expect(service.asked).toEqual([]);
  });

  test("says the service's refusals in the pack's words", async () => {
    const active = await asked(pair, { params: { token: "token-active" }, body: { code: "ABCD-EFGH" } });
    const closed = await asked(pair, { params: { token: "token-a" }, body: { code: "ABCD-GONE" } });
    const unknown = await asked(pair, { params: { token: "token-a" }, body: { code: "ABCD-NONE" } });

    expect([active.status, closed.status, unknown.status]).toEqual([409, 410, 404]);
    expect(active.message).toBe(wording("join.error.account_active"));
    expect(closed.message).toBe(wording("join.error.code_closed"));
    expect(unknown.message).toBe(wording("join.error.code_not_found"));
  });
});
