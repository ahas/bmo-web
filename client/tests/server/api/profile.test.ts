import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";
import { ownTitles } from "../../../apps/web/server/utils/account-standing";

import type { UserProfile } from "../../../apps/web/shared/types";

// A user's person's name, job title and contact details (docs/accounts.md, 「Users and senders」): the account's
// holder or an administrator reads and writes them, the login's own user and role handed to the service with the
// call, and every other login refused before the service hears of it. A changed name is followed by the person's own
// BMO and its room, and by the reader's own session (docs/web.md, 「Settings」, the account section).

const service = standInAccountService({
  users: [
    { id: 1, name: "boss", administrator: true },
    { id: 2, name: "member" }
  ]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

// The member's own BMO, titled by their login before they had a name, and its private room.
const OWN = { name: "u2", label: "member", ownerAccount: 2, provider: "codex", model: "model-a", effort: "high", thinking: "off", answerTokens: null, warming: {} };

const agency = standIn("AGENCY", (call) => {
  if (call.method === "GET" && call.path === "/supervisors") return answer({ items: [OWN], more: false });
  if (call.method === "PATCH" && call.path === "/supervisors/u2") return answer({ ...OWN, ...call.body });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "GET" && call.path === "/default-answerer") return answer({ supervisor: "agent-a" });
  if (call.method === "GET" && call.path === "/supervisors/u2/rooms") return answer({ items: [{ id: 42, title: "member", named: true, alone: true }], more: false });
  if (call.method === "PUT" && call.path === "/rooms/42/title") return answer({ title: call.body?.title ?? null });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const read = await routeOf<UserProfile>("../../apps/web/server/api/users/[user]/profile.get");
const write = await routeOf<UserProfile>("../../apps/web/server/api/users/[user]/profile.put");

const globals = globalThis as Record<string, unknown>;
const standing = globals.signedInUser;
const signedAs = (id: number | null, administrator: boolean): void => {
  globals.signedInUser = async () => ({ id, name: id === 1 ? "boss" : "member", administrator });
};

// The reader's own session as the route writes it again, in place of the one the session layer would seal.
let session: { user: Record<string, unknown> } = { user: { name: "member", id: 2 } };

globals.getUserSession = async () => session;
globals.replaceUserSession = async (_event: unknown, written: { user: Record<string, unknown> }) => {
  session = written;
};

// The signed-in reader is the whole suite's, so the one this file puts in its place goes back after each test.
afterEach(() => {
  globals.signedInUser = standing;
});

const PROFILE: UserProfile = { fullName: "", jobTitle: "Field engineer", landline: "office 12", mobile: "mobile 34", email: "engineer@example.com" };
const EMPTY: UserProfile = { fullName: "", jobTitle: "", landline: "", mobile: "", email: "" };

describe("an account's profile", () => {
  test("reads empty and is written whole by its holder, the login's user and role handed on", async () => {
    signedAs(2, false);

    expect((await asked(read, { params: { user: "2" } })).answer).toEqual(EMPTY);
    expect((await asked(write, { params: { user: "2" }, body: PROFILE })).answer).toEqual(PROFILE);
    expect(service.profiles.get(2)).toMatchObject({ jobTitle: PROFILE.jobTitle });
    expect((await asked(read, { params: { user: "2" } })).answer).toEqual(PROFILE);
  });

  test("is written by an administrator for another account", async () => {
    signedAs(1, true);

    expect((await asked(write, { params: { user: "2" }, body: PROFILE })).answer).toEqual(PROFILE);
    expect((await asked(read, { params: { user: "2" } })).answer).toEqual(PROFILE);
  });

  test("a name the holder sets is followed by their own BMO, its room and their session", async () => {
    signedAs(2, false);
    agency.asked.length = 0;
    receiver.asked.length = 0;

    const named = { ...PROFILE, fullName: "Person B" };

    expect((await asked(write, { params: { user: "2" }, body: named })).answer).toEqual(named);
    expect(agency.asked.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([{ label: ownTitles("Person B").label }]);
    expect(receiver.asked.filter((call) => call.method === "PUT").map((call) => call.body)).toEqual([{ title: ownTitles("Person B").room }]);
    expect(session.user).toEqual({ name: "member", id: 2, fullName: "Person B" });

    // The same name saved again changes nothing beyond the profile.
    agency.asked.length = 0;

    await asked(write, { params: { user: "2" }, body: { ...named, jobTitle: "Lead" } });

    expect(agency.asked.filter((call) => call.method === "PATCH")).toEqual([]);
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
