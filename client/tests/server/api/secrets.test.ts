import { afterAll, describe, expect, test } from "bun:test";

import { SECRET_NAME_MAX } from "../../../apps/web/shared/secrets";
import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";

import type { KeptSecret, SecretList } from "../../../apps/web/shared/types";

// The secret store's routes (docs/web.md, 「Settings」, the secret store section): the name and the value in the
// body, handed to the server's store for the login's own space; the answer the name, the size and the time; a name the
// store would refuse refused here before the server hears of it; and the server's refusals said in the pack's words.
// No answer carries the value.

const VALUE = "a value no answer carries";

const service = standInAccountService({
  users: [
    { id: 1, name: "tester", administrator: true },
    { id: 2, name: "member-a" }
  ]
});
const globals: Record<string, unknown> = globalThis;
const asAdministrator = globals.signedInUser;

/** The routes asked as another login for the length of `work`. */
async function signedAs<T>(login: { id: number | null; name: string; administrator: boolean }, work: () => Promise<T>): Promise<T> {
  globals.signedInUser = async () => login;

  try {
    return await work();
  } finally {
    globals.signedInUser = asAdministrator;
  }
}

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

const list = await routeOf<SecretList>("../../apps/web/server/api/secrets.get");
const keep = await routeOf<KeptSecret>("../../apps/web/server/api/secrets.post");
const drop = await routeOf<{ name: string }>("../../apps/web/server/api/secrets/[name].delete");

describe("the secret store's routes", () => {
  test("a value is kept under its name in the administrator's own space, and no answer carries it", async () => {
    const made = await asked(keep, { body: { name: "unit-a.token", value: VALUE } });

    expect(made.answer).toEqual({ name: "unit-a.token", bytes: VALUE.length, changedAt: expect.any(Number) });
    expect(service.secrets.get("unit-a.token")?.bytes.toString()).toBe(VALUE);
    expect(service.secretKeys.at(-1)).toBe("1");

    const read = await asked(list, {});

    expect(read.answer).toEqual({ secrets: [made.answer!] });
    expect(JSON.stringify(read)).not.toContain(VALUE);
  });

  test("a name that stands is replaced only where asked, said in the pack's words", async () => {
    await asked(keep, { body: { name: "unit-b.token", value: VALUE } });

    const again = await asked(keep, { body: { name: "unit-b.token", value: "another value" } });

    expect(again).toMatchObject({ status: 409, message: wording("secrets.error.exists") });
    expect(JSON.stringify(again)).not.toContain("another value");
    expect(service.secrets.get("unit-b.token")?.bytes.toString()).toBe(VALUE);

    expect((await asked(keep, { body: { name: "unit-b.token", value: "another value", replace: true } })).answer?.bytes).toBe("another value".length);
  });

  test("a name the store would refuse, or an empty value, is refused before the server hears of it", async () => {
    const heard = service.secretKeys.length;

    for (const name of ["", ".hidden", "a/b", "a.previous", "with space", 7]) {
      expect(await asked(keep, { body: { name, value: VALUE } })).toMatchObject({ status: 400, message: wording("secrets.error.bad_name", { max: SECRET_NAME_MAX }) });
    }

    expect(await asked(keep, { body: { name: "unit-c.token", value: "" } })).toMatchObject({ status: 400, message: wording("secrets.error.empty_value") });
    expect(await asked(keep, { body: { name: "unit-c.token" } })).toMatchObject({ status: 400 });
    expect(await asked(drop, { params: { name: "../web.toml" } })).toMatchObject({ status: 400 });
    expect(service.secretKeys.length).toBe(heard);
  });

  test("a file's bytes travel as base64, and the server writes them as themselves", async () => {
    const bytes = Buffer.from([0, 255, 128, 10]);
    const made = await asked(keep, { body: { name: "unit-e.bin", value: bytes.toString("base64"), encoding: "base64" } });

    expect(made.answer?.bytes).toBe(bytes.length);
    expect(service.secrets.get("unit-e.bin")?.bytes).toEqual(bytes);
  });

  test("a delete takes the name out of the list, and one that stands nowhere is said so", async () => {
    await asked(keep, { body: { name: "unit-d.token", value: VALUE } });

    expect((await asked(drop, { params: { name: "unit-d.token" } })).answer).toEqual({ name: "unit-d.token" });
    expect(service.secrets.has("unit-d.token")).toBe(false);
    expect(await asked(drop, { params: { name: "unit-d.token" } })).toMatchObject({ status: 404, message: wording("secrets.error.not_found") });
  });

  test("a member keeps a secret in a space of their own, and neither list shows the other's", async () => {
    const member = { id: 2, name: "member-a", administrator: false };
    const made = await signedAs(member, () => asked(keep, { body: { name: "own.token", value: VALUE } }));

    expect(made.status).toBe(200);
    expect(service.secrets.get("users/2/own.token")?.bytes.toString()).toBe(VALUE);
    expect((await signedAs(member, () => asked(list, {}))).answer?.secrets.map((one) => one.name)).toEqual(["own.token"]);
    expect((await asked(list, {})).answer?.secrets.map((one) => one.name)).not.toContain("own.token");
  });

  test("a login with no user holds no space: its list is empty and a write is refused before the server hears of it", async () => {
    const console = { id: null, name: "console-a", administrator: true };
    const heard = service.secretKeys.length;

    expect((await signedAs(console, () => asked(list, {}))).answer).toEqual({ secrets: [] });
    expect(await signedAs(console, () => asked(keep, { body: { name: "unit-f.token", value: VALUE } }))).toMatchObject({ status: 403, message: wording("secrets.error.no_space") });
    expect(service.secretKeys.length).toBe(heard);
  });

  test("a server that does not answer is said so", async () => {
    process.env.WEB_SERVER_ADDRESS = "http://[::1]:9";

    try {
      expect(await asked(list, {})).toMatchObject({ status: 503, message: wording("secrets.error.unreachable") });
    } finally {
      process.env.WEB_SERVER_ADDRESS = service.address;
    }
  });
});
