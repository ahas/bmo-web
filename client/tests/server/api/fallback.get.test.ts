import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { FallbackView } from "../../../apps/web/shared/types";

// The fallback as the agency answers it (its docs/api.md, 「providers, models and model files」): the account runs on
// Claude Code go out on now and the Claude accounts, and nothing the agency no longer answers — a field it still sends
// beside them is not carried, and a field it leaves out stands as the empty view has it.

const ACTIVE = { provider: "claude-code", account: "account-a", accountName: "Account A", accounts: 2, session: null, week: null };
const ACCOUNT = { id: "account-a", name: "Account A", kind: "directory", path: "/srv/accounts/a", enabled: true };

let held: Record<string, unknown> = {};

standIn("AGENCY", () => answer(held));
const handler = await routeOf<FallbackView>("../../apps/web/server/api/fallback.get");

test("carries the account in use and the accounts, and none of the fields the agency no longer answers", async () => {
  held = { active: ACTIVE, accounts: [ACCOUNT], codexPresent: true, keyPresent: true, services: [], order: [], profiles: [] };

  const { status, answer: view } = await asked(handler, {});

  expect(status).toBe(200);
  expect(view as unknown).toEqual({ active: ACTIVE, accounts: [ACCOUNT] });
});

test("stands a field the answer leaves out as the empty view has it", async () => {
  held = {};

  const { answer: view } = await asked(handler, {});

  expect(view).toEqual({ active: { provider: "claude-code", account: null, accountName: "", accounts: 0, session: null, week: null }, accounts: [] });
});
