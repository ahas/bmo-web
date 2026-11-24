import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ShareAnswer } from "../../../packages/server-client/src/index";

// The join page's ask to share a PC that already has an agent (docs/web.md, 「The join page」; docs/accounts.md, 「A
// machine shared at an invitation's ask」): the machine's name handed on with the invitation and no sign-in, the
// account the browser is signed in to named as the owner where one is, a share bound at once followed into agency as
// shared for every account already on the machine, an empty name refused before the service is asked, and the
// service's refusals said in the pack's words.

globalsRestoredAfter(["getUserSession"]);

const globals = globalThis as Record<string, unknown>;
// The session the asking browser holds, as a test sets it.
let session: { user?: { id?: number; name: string } } = {};

globals.getUserSession = async () => session;

const service = standIn("WEB_SERVER", (call) => {
  if (call.path === "/invites/token-a/share") {
    const owner = call.body?.owner;

    return answer(owner === "5" ? { machine: "pc-a", state: "bound", holders: ["5", "6"] } : { machine: "pc-a", state: "asked", holders: [] });
  }
  if (call.path === "/invites/token-none/share") return answer({ code: "no-machine", error: "no machine" }, 404);

  return answer({ code: "bad-request", error: "bad name" }, 400);
});

const agency = standIn("AGENCY", () => answer({ ownerAccount: "5", node: "pc-a" }));

process.env.WEB_SERVER_TOKEN = "the token";

afterAll(() => {
  delete process.env.WEB_SERVER_TOKEN;
});

const share = await routeOf<ShareAnswer>("../../apps/web/server/api/join/[token]/share.post");

describe("the join page's ask to share a machine", () => {
  test("asks with no owner where the browser holds no session, and follows nothing into agency while it waits", async () => {
    service.asked.length = 0;
    agency.asked.length = 0;
    session = {};

    const waiting = await asked(share, { params: { token: "token-a" }, body: { machine: " pc-a " } });

    expect(waiting.answer).toEqual({ machine: "pc-a", state: "asked", holders: [] });
    expect(service.asked.map((call) => [call.method, call.path, call.body])).toEqual([["POST", "/invites/token-a/share", { machine: "pc-a" }]]);
    expect(agency.asked).toEqual([]);
  });

  test("names the signed-in account as the owner, and sets every account on a machine bound at once as shared", async () => {
    service.asked.length = 0;
    agency.asked.length = 0;
    session = { user: { id: 5, name: "holder-a" } };

    const bound = await asked(share, { params: { token: "token-a" }, body: { machine: "pc-a" } });

    expect(bound.answer?.state).toBe("bound");
    expect(service.asked[0]?.body).toEqual({ machine: "pc-a", owner: "5" });
    expect(agency.asked.map((call) => [call.method, call.path, call.body])).toEqual([
      ["PUT", "/person-nodes/5", { node: "pc-a", shared: true }],
      ["PUT", "/person-nodes/6", { node: "pc-a", shared: true }]
    ]);
  });

  test("refuses an empty name without asking the service, and says the service's refusals in the pack's words", async () => {
    service.asked.length = 0;
    session = {};

    const empty = await asked(share, { params: { token: "token-a" }, body: { machine: "  " } });

    expect(empty.status).toBe(400);
    expect(empty.message).toBe(wording("join.error.share_empty"));
    expect(service.asked).toEqual([]);

    const none = await asked(share, { params: { token: "token-none" }, body: { machine: "pc-z" } });
    const bad = await asked(share, { params: { token: "token-bad" }, body: { machine: "pc z" } });

    expect([none.status, bad.status]).toEqual([404, 400]);
    expect(none.message).toBe(wording("join.error.share_no_machine"));
    expect(bad.message).toBe(wording("join.error.share_bad_name"));
  });
});
