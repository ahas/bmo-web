import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { ACCOUNT_ID } from "../../support/ids";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// The agency remains the sole writer and validator; these checks hold the web boundary to stable work keys and
// the two independent provider choices, each change arriving at the agency's `/fallback` as it was asked.

const agency = standIn("AGENCY", (call) =>
  call.body?.key === "unknown" ? answer({ code: "bad-request", error: "unknown fallback key: unknown" }, 400) : answer({ ok: true })
);
const sent = agency.asked;
const handler = await routeOf<{ ok: true }>("../../apps/web/server/api/fallback.post");

async function post(body: unknown): Promise<{ status: number; message: string }> {
  const { status, message } = await asked(handler, { body });

  return { status, message };
}

describe("switching route modes", () => {
  test("carries each valid word for one work key and rejects everything else locally", async () => {
    sent.length = 0;

    for (const mode of ["auto", "claude-code", "codex", "openrouter", "registered"]) {
      expect(await post({ action: "set-route-mode", key: "agent-a", mode })).toMatchObject({ status: 200 });
    }

    expect(sent.map(({ body }) => body?.mode)).toEqual(["auto", "claude-code", "codex", "openrouter", "registered"]);
    sent.length = 0;

    for (const mode of ["on", "AUTO", "local", "", 1, undefined]) {
      expect(await post({ action: "set-route-mode", key: "agent-a", mode })).toMatchObject({ status: 400 });
    }

    expect(sent).toEqual([]);
  });


});

describe("choosing fallback providers by work key", () => {
  test("carries a Codex model and effort independently of the primary model", async () => {
    sent.length = 0;

    expect(
      await post({ action: "set-codex", key: "agent-a", codexModel: "gpt-5.6-sol", codexEffort: "xhigh" })
    ).toMatchObject({ status: 200 });
    expect(sent[0]?.body).toMatchObject({ action: "set-codex", key: "agent-a" });

    expect(await post({ action: "reset-codex", key: "agent-a" })).toMatchObject({ status: 200 });
    expect(sent[1]?.body).toMatchObject({ action: "reset-codex", key: "agent-a" });
  });

  test("carries the optional OpenRouter choice and its clearing separately", async () => {
    sent.length = 0;

    expect(
      await post({ action: "set-openrouter", key: "content-judge", openrouterModel: "deepseek/deepseek-r1:free" })
    ).toMatchObject({ status: 200 });
    expect(sent[0]?.body).toMatchObject({ action: "set-openrouter", key: "content-judge" });

    expect(await post({ action: "clear-openrouter", key: "content-judge" })).toMatchObject({ status: 200 });
    expect(sent[1]?.body).toMatchObject({ action: "clear-openrouter", key: "content-judge" });
  });

  test("sets one work key's route, and lets the agency reject an unknown key", async () => {
    sent.length = 0;

    expect(await post({ action: "set-route-mode", key: "job-worker", mode: "registered" })).toMatchObject({ status: 200 });
    expect(sent[0]?.body).toMatchObject({ action: "set-route-mode", key: "job-worker", mode: "registered" });

    const refused = await post({ action: "set-route-mode", key: "unknown", mode: "auto" });
    expect(refused.status).toBe(400);
    expect(refused.message).toBe(wording("agents.error.agency_bad_request"));
  });

  test("rejects incomplete choices without calling the agency", async () => {
    sent.length = 0;

    for (const body of [
      { action: "set-codex", key: "agent-a", codexModel: "gpt-5.6-sol" },
      { action: "set-codex", key: "agent-a", codexEffort: "xhigh" },
      { action: "set-openrouter", key: "agent-a" },
      { action: "set-route-mode", key: "agent-a" },
      { action: "reset-codex" },
      { action: "swap", key: "agent-a" }
    ]) {
      expect(await post(body)).toMatchObject({ status: 400 });
    }

    expect(sent).toEqual([]);
  });
});

test("carries Claude and local model choices without losing the model field", async () => {
  sent.length = 0;
  for (const action of ["set-claude", "set-local-model"]) {
    expect(await post({ action, key: "agent-a", model: "chosen-model" })).toMatchObject({ status: 200 });
    expect(sent.at(-1)?.body).toMatchObject({ action, key: "agent-a" });
  }
});

describe("the provider order", () => {
  test("carries a list of names without a key, and refuses anything that is not a list locally", async () => {
    sent.length = 0;

    expect(await post({ action: "set-provider-order", order: ["registered", "openrouter", "claude-code", "codex"] })).toMatchObject({ status: 200 });
    expect(await post({ action: "reset-provider-order" })).toMatchObject({ status: 200 });
    expect(sent).toMatchObject([
      { method: "PATCH", path: "/fallback", body: { action: "set-provider-order", order: ["registered", "openrouter", "claude-code", "codex"] } },
      { method: "PATCH", path: "/fallback", body: { action: "reset-provider-order", order: null } },
    ]);
    sent.length = 0;

    for (const order of [undefined, "claude-code,codex", [1, 2], { order: [] }]) {
      expect(await post({ action: "set-provider-order", order })).toMatchObject({ status: 400 });
    }
    expect(sent).toHaveLength(0);
  });
});

test("passes switches, entry orders and the local model's options through unchanged", async () => {
  sent.length = 0;
  expect((await post({ action: "set-provider-enabled", provider: "claude-code", enabled: false })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "set-provider-enabled", provider: "claude-code", enabled: false });
  const order = ["claude-code", "codex", "openrouter", "registered"].map(name => ({ name, enabled: name !== "claude-code" }));
  expect((await post({ action: "set-provider-order", order })).status).toBe(200);
  expect(sent.at(-1)?.body?.order).toEqual(order);
  expect((await post({ action: "set-provider-enabled", provider: "codex", enabled: "false" })).status).toBe(400);
  expect((await post({ action: "set-local-model", key: "agent-a", model: "model-a", thinking: true, answerTokens: 2048 })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "set-local-model", key: "agent-a" });
  expect((await post({ action: "set-local-model", key: "agent-a", model: "model-a", answerTokens: 3000 })).status).toBe(400);
  // A registered model's window is its registration's, set in the registry, and no action of this route.
  expect((await post({ action: "set-context-tokens", provider: "registered", tokens: 32_768 })).status).toBe(400);
});

// A gate's own request options are the gate unit's, which is not split, so a change that reads as one is
// refused as unavailable and nothing is sent; one that does not read is refused for what is wrong with it.
test("refuses a gate's options as unavailable, and thinking, a size or a wait that could never stand", async () => {
  sent.length = 0;

  for (const body of [{ timeoutMs: 30_000 }, { layaMode: "filter" }, { layaTau: 0.9 }, { layaMode: null, layaTau: null }, { enabled: false }]) {
    expect(await post({ action: "set-gate-options", key: "gate-a", ...body })).toMatchObject({ status: 503, message: wording("agents.error.gate_options_unavailable") });
  }

  expect(sent).toEqual([]);

  for (const body of [
    { answerTokens: 4096 },
    { thinking: true, timeoutMs: 30_000 },
    { timeoutMs: null },
    { timeoutMs: 500 },
    { timeoutMs: 300_001 },
    { timeoutMs: 1_500.5 },
    {},
    { layaMode: "guess" },
    { layaTau: 1.5 },
    { layaTau: "0.9" },
    { enabled: "off" },
  ]) {
    expect(`${JSON.stringify(body)}: ${(await post({ action: "set-gate-options", key: "gate-a", ...body })).status}`)
      .toBe(`${JSON.stringify(body)}: 400`);
  }

  expect(sent).toEqual([]);
  expect((await post({ action: "set-gate-options", timeoutMs: 2_000 })).status).toBe(400);
});

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

// Which login one work key runs on.
test("carries a key's account choice, and refuses a body that names none", async () => {
  sent.length = 0;

  expect((await post({ action: "set-route-account", key: "agent-a", account: ACCOUNT_ID })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "set-route-account", key: "agent-a", account: ACCOUNT_ID });
  expect((await post({ action: "set-route-account", key: "agent-a", account: "auto" })).status).toBe(200);
  expect(sent.at(-1)?.body).toMatchObject({ action: "set-route-account", key: "agent-a", account: "auto" });
  sent.length = 0;

  for (const body of [
    { action: "set-route-account", key: "agent-a" },
    { action: "set-route-account", key: "agent-a", account: "  " },
    { action: "set-route-account", account: ACCOUNT_ID },
  ]) {
    expect(`${JSON.stringify(body)}: ${(await post(body)).status}`).toBe(`${JSON.stringify(body)}: 400`);
  }

  expect(sent).toEqual([]);
});
