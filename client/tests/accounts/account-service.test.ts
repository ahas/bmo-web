// The account service's client (`packages/accounts`), asked against the stand-in on the routes
// `docs/boundary.md` states: the session routes under `/sumida`, the server's own behind its token, and
// the refusals each function reads as an answer rather than a failure.

import { afterAll, describe, expect, test } from "bun:test";

import {
  AccountRefusal,
  adoptPhone,
  changeUserPassword,
  checkObject,
  checkRoom,
  deletePhoneKey,
  dropSecret,
  keepSecret,
  listSecrets,
  makePhoneKey,
  modelState,
  phoneHolder,
  renameUser,
  runMove,
  sessionUser,
  signIn,
  signOut,
  userOf
} from "../../apps/web/server/utils/account-service";
import { standInAccountService } from "../support/account-service";
import { OWNER_ID, ROOM_ID } from "../support/ids";

const MEMBER = 777;
const BROWSER = "127.0.0.1";

const service = standInAccountService({
  users: [
    { id: 1, name: "owner-a", password: "the password", administrator: true, senders: [OWNER_ID] },
    { id: 2, name: "member-a", password: "a password", senders: [MEMBER] }
  ],
  grants: [{ object: String(ROOM_ID), relation: "rule", subject: "user:2" }]
});
const options = { address: service.address, token: service.token };

afterAll(() => service.stop());

describe("sessions", () => {
  test("a sign-in answers a cookie that names its user until it is signed out", async () => {
    const cookie = await signIn("member-a", "a password", BROWSER, options);

    expect(cookie).toStartWith("bmo.sid=");
    expect(await sessionUser(cookie!, BROWSER, options)).toEqual({ id: "2", name: "member-a" });

    await signOut(cookie!, BROWSER, options);

    expect(await sessionUser(cookie!, BROWSER, options)).toBeNull();
  });

  test("a wrong password is no session, not a failure", async () => {
    expect(await signIn("member-a", "not it", BROWSER, options)).toBeNull();
  });
});

describe("the model", () => {
  test("its state reads in force, and why not where it is not", async () => {
    expect(await modelState(options)).toEqual({ inForce: true });

    service.state.inForce = false;

    try {
      expect(await modelState(options)).toEqual({ inForce: false, reason: "the data move has not been written" });
      await expect(userOf(2, options)).rejects.toMatchObject({ status: 503, code: "not-in-force" });
    } finally {
      service.state.inForce = true;
    }
  });

  test("a server that does not answer has no state", async () => {
    expect(await modelState({ address: "http://[::1]:9", token: "none" })).toBeNull();
  });

  test("the move is handed in the common wire format and answers its administrator", async () => {
    const moved = await runMove({ ownerSenders: [OWNER_ID], rooms: [ROOM_ID], roomRules: [] }, options);

    expect(moved).toEqual({ done: true, written: true, administrator: "1" });
    expect(service.moves.at(-1)).toEqual({ ownerSenders: [OWNER_ID], rooms: [ROOM_ID], roomRules: [] });
  });
});

describe("users", () => {
  test("a user reads with their senders, and one that is not there is none", async () => {
    expect(await userOf("2", options)).toEqual({ id: "2", name: "member-a", administrator: false, senders: [MEMBER] });
    expect(await userOf(99, options)).toBeNull();
  });

  test("a password changes only on the current one", async () => {
    expect(await changeUserPassword(2, "not it", "another password", options)).toBe(false);
    expect(await changeUserPassword(2, "a password", "another password", options)).toBe(true);
    expect(await signIn("member-a", "another password", BROWSER, options)).not.toBeNull();
  });

  test("a name another user holds is refused as an answer", async () => {
    expect(await renameUser(2, "owner-a", options)).toBe(false);
    expect(await renameUser(2, "member-b", options)).toBe(true);
    expect((await userOf(2, options))?.name).toBe("member-b");
  });

  test("a wrong token is a refusal with its code", async () => {
    let refusal: AccountRefusal | null = null;

    try {
      await userOf(2, { ...options, token: "wrong" });
    } catch (error) {
      if (error instanceof AccountRefusal) refusal = error;
    }

    expect(refusal).toBeInstanceOf(AccountRefusal);
    expect(refusal).toMatchObject({ status: 401, code: "unauthorized" });
  });
});

describe("checks", () => {
  test("a room's rule opens the room to its user, and the administrator passes", async () => {
    expect(await checkRoom(ROOM_ID, MEMBER, "approve", options)).toEqual({ allowed: true, grant: `bmo_room:${ROOM_ID}#approve`, user: "2" });
    expect(await checkRoom(-200, MEMBER, "approve", options)).toMatchObject({ allowed: false, user: "2" });
    expect(await checkRoom(-200, OWNER_ID, "approve", options)).toMatchObject({ allowed: true, user: "1" });
    expect(await checkRoom(-200, null, "approve", options)).toMatchObject({ allowed: false, user: null });
  });

  test("an object check names its grant and its user", async () => {
    expect(await checkObject("bmo_worker", "worker", "run", 2, options)).toEqual({
      allowed: false,
      grant: "bmo_worker:worker#run",
      user: "2"
    });
  });
});

describe("phone keys", () => {
  test("a key is made once, names its holder, and is gone once deleted", async () => {
    const made = await makePhoneKey(2, options);

    expect(await phoneHolder(made.key, options)).toEqual({ user: "2", name: "member-b", hash: made.hash });

    await deletePhoneKey(made.hash, options);

    expect(await phoneHolder(made.key, options)).toBeNull();
  });

  test("an earlier token is adopted as a key of its user", async () => {
    const hash = await adoptPhone("an earlier token", 2, options);

    expect(await phoneHolder("an earlier token", options)).toEqual({ user: "2", name: "member-b", hash });
  });
});

describe("the secret store", () => {
  const VALUE = "a value no answer carries";

  test("a value is written under a name in the login's role, and the answers name it without the value", async () => {
    const kept = await keepSecret("unit-a.token", VALUE, false, "administrator", options);

    expect(kept).toEqual({ name: "unit-a.token", bytes: VALUE.length, changedAt: expect.any(Number) });
    expect(service.secrets.get("unit-a.token")?.value).toBe(VALUE);
    expect(await listSecrets("administrator", options)).toEqual([kept]);
    expect(JSON.stringify(await listSecrets("administrator", options))).not.toContain(VALUE);
    expect(service.secretRoles.at(-1)).toBe("administrator");
  });

  test("a name that stands is replaced only where asked, and a delete takes it out of the list", async () => {
    await keepSecret("unit-b.token", VALUE, false, "administrator", options);

    await expect(keepSecret("unit-b.token", "another", false, "administrator", options)).rejects.toMatchObject({ status: 409, code: "secret-exists" });
    expect((await keepSecret("unit-b.token", "another", true, "administrator", options)).bytes).toBe("another".length);

    await dropSecret("unit-b.token", "administrator", options);

    expect((await listSecrets("administrator", options)).map((one) => one.name)).not.toContain("unit-b.token");
    await expect(dropSecret("unit-b.token", "administrator", options)).rejects.toMatchObject({ status: 404, code: "not-found" });
  });

  test("a member's role is refused by the server", async () => {
    await expect(listSecrets("member", options)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(keepSecret("unit-c.token", VALUE, false, "member", options)).rejects.toMatchObject({ status: 403 });
    expect(service.secrets.has("unit-c.token")).toBe(false);
  });
});
