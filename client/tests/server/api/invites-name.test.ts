import { afterAll, describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Accepted, Invite } from "../../../packages/server-client/src/index";

// The person's name on the invitation road (docs/accounts.md, 「Invitations and a person's machine」; docs/web.md,
// 「Organisation」, the invitations tab, and 「The join page」): the maker may give it with the invitation, and the join page hands
// it on with the login and the password, a call giving none leaving the invitation's.

const UNIT = { id: 3, name: "team-a" };
const INVITE = { token: "token-a", unit: UNIT, company: UNIT, head: false, expiresAt: 1 };

const service = standIn("WEB_SERVER", (call) => {
  if (call.method === "POST" && call.path === "/invites") return answer({ ...INVITE, fullName: call.body?.fullName ?? "" }, 201);
  if (call.method === "POST" && call.path === "/invites/token-a/accept") {
    return answer({ user: "5", agent: "u5", credential: "u5.credential", hubUrl: "http://hub.invalid", install: { linux: "linux", windows: "windows" } }, 201);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

process.env.WEB_SERVER_TOKEN = "the token";

afterAll(() => {
  delete process.env.WEB_SERVER_TOKEN;
});

const make = await routeOf<Invite>("../../apps/web/server/api/invites/index.post");
const accept = await routeOf<Accepted>("../../apps/web/server/api/join/[token]/accept.post");

describe("the person's name on an invitation", () => {
  test("is handed on with the invitation where the maker gives one, and left out where they give none", async () => {
    service.asked.length = 0;

    expect((await asked(make, { body: { unit: 3, head: false, hours: 24, fullName: "  Person A " } })).answer).toMatchObject({ fullName: "Person A" });
    await asked(make, { body: { unit: 3, head: false, hours: 24, fullName: "" } });

    expect(service.asked.map((call) => call.body)).toEqual([
      { unit: 3, head: false, hours: 24, fullName: "Person A" },
      { unit: 3, head: false, hours: 24 }
    ]);
  });

  test("is handed on with the login and the password as the invitation is accepted", async () => {
    service.asked.length = 0;

    await asked(accept, { params: { token: "token-a" }, body: { name: "person-a", password: "pw", fullName: " Person A " } });

    expect(service.asked.map((call) => call.body)).toEqual([{ name: "person-a", password: "pw", fullName: "Person A" }]);
  });

  test("a call giving none hands on an empty one, so the service keeps the invitation's", async () => {
    service.asked.length = 0;

    await asked(accept, { params: { token: "token-a" }, body: { name: "person-a", password: "pw" } });

    expect(service.asked.map((call) => call.body)).toEqual([{ name: "person-a", password: "pw", fullName: "" }]);
  });
});
