import { afterAll, describe, expect, test } from "bun:test";

import { SECRET_NAME_MAX } from "../../../apps/web/shared/secrets";
import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";

import type { KeptSecret, SecretList } from "../../../apps/web/shared/types";

// The secret store's routes (docs/web.md, 「Settings」, the secret store section): the name and the value in the
// body, handed to the server's store in the login's role; the answer the name, the size and the time; a name the
// store would refuse refused here before the server hears of it; and the server's refusals said in the pack's words.
// No answer carries the value.

const VALUE = "a value no answer carries";

const service = standInAccountService();

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
  test("a value is kept under its name in the administrator's role, and no answer carries it", async () => {
    const made = await asked(keep, { body: { name: "unit-a.token", value: VALUE } });

    expect(made.answer).toEqual({ name: "unit-a.token", bytes: VALUE.length, changedAt: expect.any(Number) });
    expect(service.secrets.get("unit-a.token")?.value).toBe(VALUE);
    expect(service.secretRoles.at(-1)).toBe("administrator");

    const read = await asked(list, {});

    expect(read.answer).toEqual({ secrets: [made.answer!] });
    expect(JSON.stringify(read)).not.toContain(VALUE);
  });

  test("a name that stands is replaced only where asked, said in the pack's words", async () => {
    await asked(keep, { body: { name: "unit-b.token", value: VALUE } });

    const again = await asked(keep, { body: { name: "unit-b.token", value: "another value" } });

    expect(again).toMatchObject({ status: 409, message: wording("secrets.error.exists") });
    expect(JSON.stringify(again)).not.toContain("another value");
    expect(service.secrets.get("unit-b.token")?.value).toBe(VALUE);

    expect((await asked(keep, { body: { name: "unit-b.token", value: "another value", replace: true } })).answer?.bytes).toBe("another value".length);
  });

  test("a name the store would refuse, or an empty value, is refused before the server hears of it", async () => {
    const heard = service.secretRoles.length;

    for (const name of ["", ".hidden", "a/b", "a.previous", "with space", 7]) {
      expect(await asked(keep, { body: { name, value: VALUE } })).toMatchObject({ status: 400, message: wording("secrets.error.bad_name", { max: SECRET_NAME_MAX }) });
    }

    expect(await asked(keep, { body: { name: "unit-c.token", value: "" } })).toMatchObject({ status: 400, message: wording("secrets.error.empty_value") });
    expect(await asked(keep, { body: { name: "unit-c.token" } })).toMatchObject({ status: 400 });
    expect(await asked(drop, { params: { name: "../web.toml" } })).toMatchObject({ status: 400 });
    expect(service.secretRoles.length).toBe(heard);
  });

  test("a delete takes the name out of the list, and one that stands nowhere is said so", async () => {
    await asked(keep, { body: { name: "unit-d.token", value: VALUE } });

    expect((await asked(drop, { params: { name: "unit-d.token" } })).answer).toEqual({ name: "unit-d.token" });
    expect(service.secrets.has("unit-d.token")).toBe(false);
    expect(await asked(drop, { params: { name: "unit-d.token" } })).toMatchObject({ status: 404, message: wording("secrets.error.not_found") });
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
