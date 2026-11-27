import { afterAll, describe, expect, test } from "bun:test";

import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";

import type { SecretKind, SecretKindList } from "../../../apps/web/shared/secret-kinds";

// The kinds the secret form opened at a unit's node is offered (docs/web.md, 「System and organisation」, the
// secrets tab): the registry narrowed to the keys the unit's chain leaves under `secret.kinds`, and the whole
// registry where the chain or the kind says nothing, just as the store takes a value (docs/accounts.md,
// 「Secret kinds」). A person's own form and the platform's keep reading the whole registry (docs/web.md,
// 「Settings」, the secret store section), so they stand nowhere here.

const service = standInAccountService();

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
  delete process.env.WEB_SERVER_TOKEN;
});

const unitKinds = await routeOf<SecretKindList>("../../apps/web/server/api/organization/units/[unit]/secret-kinds.get");

function kindOf(key: string): SecretKind {
  return { key, name: key, description: "", fields: [{ key: key.toUpperCase(), label: "value", masked: false, input: "line", required: true }] };
}

const API_KEY = kindOf("api-key");
const CARD = kindOf("card");
const LOGIN = kindOf("login");

service.kinds.set(API_KEY.key, API_KEY);
service.kinds.set(CARD.key, CARD);
service.kinds.set(LOGIN.key, LOGIN);

describe("the kinds a unit's secret form is offered", () => {
  test("narrows the registry to the keys the unit's chain leaves, in the order the kinds were added", async () => {
    service.chain.set("secret.kinds", new Map([["unit:5", ["card", "api-key"]]]));

    const got = await asked(unitKinds, { params: { unit: "5" } });

    expect(got.answer?.kinds.map((one) => one.key)).toEqual(["api-key", "card"]);
  });

  test("offers every kind where the unit's chain says nothing", async () => {
    service.chain.set("secret.kinds", new Map());

    const got = await asked(unitKinds, { params: { unit: "6" } });

    expect(got.answer?.kinds.map((one) => one.key)).toEqual(["api-key", "card", "login"]);
  });

  test("offers every kind where the deployment declares no such chain kind", async () => {
    service.chain.clear();

    const got = await asked(unitKinds, { params: { unit: "5" } });

    expect(got.answer?.kinds.map((one) => one.key)).toEqual(["api-key", "card", "login"]);
  });
});
