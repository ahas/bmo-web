import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { ACCOUNT_ID } from "../../support/ids";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// The agency remains the sole writer and validator, and its `/fallback` change takes the Claude account list's own
// actions alone (its docs/api.md, 「providers, models and model files」): these checks hold the web boundary to those,
// each arriving at the agency as it was asked, and refuse every road and route action before the agency is asked.

const agency = standIn("AGENCY", () => answer({ ok: true }));
const sent = agency.asked;

const handler = await routeOf<{ ok: true }>("../../apps/web/server/api/fallback.post");

async function post(body: unknown): Promise<{ status: number; message: string }> {
  const { status, message } = await asked(handler, { body });

  return { status, message };
}

// The Claude accounts. The bot owns every refusal; this route stops a malformed request from
// travelling and carries a path — never a credential.
test("carries the account list's own changes, and a path is all it takes of a credential", async () => {
  sent.length = 0;

  expect((await post({ action: "add-account", name: "Spare", kind: "directory", path: "/home/user/.claude-sub" })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "add-account", name: "Spare", kind: "directory", path: "/home/user/.claude-sub" });

  expect((await post({ action: "update-account", account: ACCOUNT_ID, name: "Main", kind: "token", path: "/home/user/sub.token" })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "update-account", account: ACCOUNT_ID, kind: "token" });

  expect((await post({ action: "set-account-enabled", account: ACCOUNT_ID, enabled: false })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "set-account-enabled", account: ACCOUNT_ID, enabled: false });

  const order = [{ id: ACCOUNT_ID, enabled: true }, { id: "default", enabled: false }];

  expect((await post({ action: "set-account-order", order })).status).toBe(200);
  expect(sent.at(-1)?.body?.order).toEqual(order);
  expect((await post({ action: "set-account-order", order: [ACCOUNT_ID, "default"] })).status).toBe(200);

  expect((await post({ action: "remove-account", account: ACCOUNT_ID })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "remove-account", account: ACCOUNT_ID });

  expect((await post({ action: "choose-account", account: ACCOUNT_ID })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "choose-account", account: ACCOUNT_ID });
  expect((await post({ action: "clear-account-choice" })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "clear-account-choice" });

  sent.length = 0;

  for (const body of [
    { action: "add-account", name: "", path: "/home/user/.claude-sub" },
    { action: "add-account", name: "Spare" },
    { action: "add-account", name: "Spare", path: "" },
    { action: "add-account", name: "Spare", kind: "keychain", path: "/home/user/.claude-sub" },
    { action: "update-account", name: "Spare" },
    { action: "remove-account" },
    { action: "set-account-enabled", account: ACCOUNT_ID },
    { action: "set-account-enabled", enabled: true },
    { action: "set-account-order", order: ACCOUNT_ID },
    { action: "set-account-order", order: [{ id: ACCOUNT_ID }] },
    { action: "choose-account" },
  ]) {
    expect(`${JSON.stringify(body)}: ${(await post(body)).status}`).toBe(`${JSON.stringify(body)}: 400`);
  }

  expect(sent).toEqual([]);
});

// The road and route actions the agency answers as gone or unknown: a work key's mode, its account and its models,
// the provider order and a provider's switch.
test("refuses every action that is not the account list's own, asking the agency nothing", async () => {
  sent.length = 0;

  for (const body of [
    { action: "set-route-mode", key: "agent-a", mode: "auto" },
    { action: "set-route-account", key: "agent-a", account: ACCOUNT_ID },
    { action: "set-claude", key: "agent-a", model: "model-a" },
    { action: "set-codex", key: "agent-a", codexModel: "model-a", codexEffort: "high" },
    { action: "set-openrouter", key: "agent-a", openrouterModel: "model-a" },
    { action: "set-provider-order", order: ["claude-code"] },
    { action: "set-provider-enabled", provider: "claude-code", enabled: false },
    { action: "set-gate-options", key: "gate-a", timeoutMs: 30_000 },
    {}
  ]) {
    expect(await post(body)).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
  }

  expect(sent).toEqual([]);
});
