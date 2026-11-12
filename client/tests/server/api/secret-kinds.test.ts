import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";

import type { SecretKind, SecretKindList } from "../../../apps/web/shared/secret-kinds";

// The secret kinds' routes (docs/web.md, 「Settings」, the secret store section): a kind read out of the body in its
// own shape and handed to the server in the login's role, the path's key standing for a change, and the server's
// refusals said in the pack's words.

const service = standInAccountService();

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

const list = await routeOf<SecretKindList>("../../apps/web/server/api/secret-kinds.get");
const add = await routeOf<SecretKind>("../../apps/web/server/api/secret-kinds.post");
const change = await routeOf<SecretKind>("../../apps/web/server/api/secret-kinds/[key].put");
const drop = await routeOf<{ key: string }>("../../apps/web/server/api/secret-kinds/[key].delete");

const KIND: SecretKind = {
  key: "unit-login",
  name: "unit login",
  description: "a user and a password",
  fields: [
    { key: "USER", label: "user", masked: false, input: "line", required: true },
    { key: "PASS", label: "password", masked: true, input: "line", required: true }
  ]
};

describe("the secret kinds' routes", () => {
  test("a kind is added, read, changed under its path's key and removed", async () => {
    expect((await asked(add, { body: KIND })).answer).toEqual(KIND);
    expect((await asked(list, {})).answer?.kinds).toEqual([KIND]);

    const changed = await asked(change, { params: { key: KIND.key }, body: { ...KIND, key: "another-key", name: "renamed" } });

    expect(changed.answer).toEqual({ ...KIND, name: "renamed" });
    expect((await asked(drop, { params: { key: KIND.key } })).answer).toEqual({ key: KIND.key });
    expect(service.kinds.size).toBe(0);
  });

  test("the server's refusals are said in the pack's words", async () => {
    await asked(add, { body: KIND });

    expect(await asked(add, { body: KIND })).toMatchObject({ status: 409, message: wording("secrets.error.kind_exists") });
    expect(await asked(add, { body: { ...KIND, key: "empty-kind", fields: [] } })).toMatchObject({ status: 400, message: wording("secrets.error.bad_kind") });
    expect(await asked(drop, { params: { key: "no-such-kind" } })).toMatchObject({ status: 404, message: wording("secrets.error.not_found") });
  });

  test("a body that does not read as a kind is refused before the server hears of it", async () => {
    const before = service.kinds.size;

    expect(await asked(add, { body: { ...KIND, key: "odd-input", fields: [{ ...KIND.fields[0], input: "voice" }] } })).toMatchObject({ status: 400, message: wording("secrets.error.bad_kind") });
    expect(await asked(add, { body: { key: "no-fields" } })).toMatchObject({ status: 400 });
    expect(service.kinds.size).toBe(before);
  });
});
