// The account service's client (`packages/accounts`), asked against the stand-in on the routes
// `docs/boundary.md` states: the session routes under `/sumida`, the server's own behind its token, and
// the refusals each function reads as an answer rather than a failure.

import { afterAll, describe, expect, test } from "bun:test";

import {
  AccountRefusal,
  addSecretKind,
  adoptPhone,
  deletePhoneKey,
  dropSecret,
  dropSecretKind,
  keepSecret,
  listSecretKinds,
  listSecrets,
  makePhoneKey,
  modelState,
  phoneHolder,
  putSecretKind,
  renameUser,
  runMove,
  sessionUser,
  signIn,
  signOut,
  userOf
} from "../../apps/web/server/utils/account-service";
import { changePasswordKeeping } from "../../apps/web/server/utils/account-security";
import { standInAccountService } from "../support/account-service";
import { OWNER_ID } from "../support/ids";

const MEMBER = 777;
const BROWSER = "127.0.0.1";

const service = standInAccountService({
  users: [
    { id: 1, name: "owner-a", password: "the password", administrator: true, senders: [OWNER_ID] },
    { id: 2, name: "member-a", password: "a password", senders: [MEMBER] }
  ]
});
const options = { address: service.address, token: service.token };

afterAll(() => service.stop());

describe("sessions", () => {
  test("a sign-in answers a cookie that names its user until it is signed out", async () => {
    const cookie = await signIn("member-a", "a password", BROWSER, options);

    expect(cookie).toStartWith("bmo.sid=");
    expect(await sessionUser(cookie!, BROWSER, options)).toEqual({ id: "2", name: "member-a", fullName: "" });

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
    const moved = await runMove({ ownerSenders: [OWNER_ID] }, options);

    expect(moved).toEqual({ done: true, written: true, administrator: "1" });
    expect(service.moves.at(-1)).toEqual({ ownerSenders: [OWNER_ID] });
  });
});

describe("users", () => {
  test("a user reads with their senders, and one that is not there is none", async () => {
    expect(await userOf("2", options)).toEqual({ id: "2", name: "member-a", fullName: "", administrator: false, senders: [MEMBER] });
    expect(await userOf(99, options)).toBeNull();
  });

  test("a password changes only on the current one", async () => {
    const browser = { address: BROWSER, userAgent: "" };

    expect(await changePasswordKeeping(2, "not it", "another password", null, browser, options)).toBe(false);
    expect(await changePasswordKeeping(2, "a password", "another password", null, browser, options)).toEqual({ cookie: null });
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
  const text = (value: string) => ({ value, encoding: "text" as const });

  test("a value is written under a name in the login's own space, and the answers name it without the value", async () => {
    const kept = await keepSecret("unit-a.token", text(VALUE), false, "1", options);

    expect(kept).toEqual({ name: "unit-a.token", bytes: VALUE.length, changedAt: expect.any(Number) });
    expect(service.secrets.get("unit-a.token")?.bytes.toString()).toBe(VALUE);
    expect(await listSecrets("1", options)).toEqual([kept]);
    expect(JSON.stringify(await listSecrets("1", options))).not.toContain(VALUE);
    expect(service.secretKeys.at(-1)).toBe("1");
  });

  test("a member's secret stands in a space of their own, which the administrator's list never shows", async () => {
    await keepSecret("own.token", text(VALUE), false, "2", options);

    expect(service.secrets.has("users/2/own.token")).toBe(true);
    expect((await listSecrets("2", options)).map((one) => one.name)).toEqual(["own.token"]);
    expect((await listSecrets("1", options)).map((one) => one.name)).not.toContain("own.token");
  });

  test("a name that stands is replaced only where asked, and a delete takes it out of the list", async () => {
    await keepSecret("unit-b.token", text(VALUE), false, "1", options);

    await expect(keepSecret("unit-b.token", text("another"), false, "1", options)).rejects.toMatchObject({ status: 409, code: "secret-exists" });
    expect((await keepSecret("unit-b.token", text("another"), true, "1", options)).bytes).toBe("another".length);

    await dropSecret("unit-b.token", "1", options);

    expect((await listSecrets("1", options)).map((one) => one.name)).not.toContain("unit-b.token");
    await expect(dropSecret("unit-b.token", "1", options)).rejects.toMatchObject({ status: 404, code: "not-found" });
  });

  test("a file's bytes go as base64 and are written as themselves", async () => {
    const bytes = Buffer.from([0, 255, 128, 10]);

    expect((await keepSecret("unit-d.bin", { value: bytes.toString("base64"), encoding: "base64" }, false, "1", options)).bytes).toBe(4);
    expect(service.secrets.get("unit-d.bin")?.bytes).toEqual(bytes);
  });

  test("a kind is added, changed whole and removed in the login's role, and read by any login", async () => {
    const kind = { key: "unit-login", name: "unit login", description: "", fields: [{ key: "USER", label: "user", masked: false, input: "line" as const, required: true }] };

    expect(await addSecretKind(kind, "administrator", options)).toEqual(kind);
    expect(await putSecretKind({ ...kind, name: "renamed" }, "administrator", options)).toMatchObject({ name: "renamed" });
    expect((await listSecretKinds(options)).map((one) => one.name)).toContain("renamed");

    await expect(addSecretKind({ ...kind, key: "another" }, "member", options)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await dropSecretKind(kind.key, "administrator", options);

    expect((await listSecretKinds(options)).map((one) => one.key)).not.toContain(kind.key);
  });
});
