import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";

import type { UserProfile } from "../../../apps/web/shared/types";

// A user's job title and contact details (docs/accounts.md, 「Users and senders」): the account's holder or an
// administrator reads and writes them, the login's own user and role handed to the service with the call, and
// every other login refused before the service hears of it.

const service = standInAccountService({
  users: [
    { id: 1, name: "boss", administrator: true },
    { id: 2, name: "member" }
  ]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => service.stop());

const read = await routeOf<UserProfile>("../../apps/web/server/api/users/[user]/profile.get");
const write = await routeOf<UserProfile>("../../apps/web/server/api/users/[user]/profile.put");

const globals = globalThis as Record<string, unknown>;
const signedAs = (id: number | null, administrator: boolean): void => {
  globals.signedInUser = async () => ({ id, name: id === 1 ? "boss" : "member", administrator });
};

const PROFILE: UserProfile = { jobTitle: "Field engineer", landline: "office 12", mobile: "mobile 34", email: "engineer@example.com" };

describe("an account's profile", () => {
  test("reads empty and is written whole by its holder, the login's user and role handed on", async () => {
    signedAs(2, false);

    expect((await asked(read, { params: { user: "2" } })).answer).toEqual({ jobTitle: "", landline: "", mobile: "", email: "" });
    expect((await asked(write, { params: { user: "2" }, body: PROFILE })).answer).toEqual(PROFILE);
    expect(service.profiles.get(2)).toEqual(PROFILE);
    expect((await asked(read, { params: { user: "2" } })).answer).toEqual(PROFILE);
  });

  test("is written by an administrator for another account", async () => {
    signedAs(1, true);

    expect((await asked(write, { params: { user: "2" }, body: PROFILE })).answer).toEqual(PROFILE);
    expect((await asked(read, { params: { user: "2" } })).answer).toEqual(PROFILE);
  });

  test("is refused to another login before the service is asked", async () => {
    signedAs(2, false);
    const heard = service.profiles.size;

    for (const handle of [read, write]) {
      const refused = await asked(handle, { params: { user: "1" }, ...(handle === write ? { body: PROFILE } : {}) });

      expect([refused.status, refused.message]).toEqual([403, wording("account.error.profile_forbidden")]);
    }

    expect(service.profiles.size).toBe(heard);
  });

  test("refuses a body that is not a profile, and a path that is no user", async () => {
    signedAs(2, false);

    expect(await asked(write, { params: { user: "2" }, body: { ...PROFILE, jobTitle: 7 } })).toMatchObject({
      status: 400,
      message: wording("account.error.profile_shape")
    });
    expect(await asked(write, { params: { user: "2" }, body: { jobTitle: "Field engineer" } })).toMatchObject({ status: 400 });
    expect(await asked(read, { params: { user: "someone" } })).toMatchObject({ status: 400 });
  });
});
