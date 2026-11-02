import { isFallbackRouteMode } from "#shared/config";
import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";
import type { FallbackChanged } from "#shared/types";

type FallbackChange = components["schemas"]["FallbackChange"];

interface FallbackBody {
  action?: unknown;
  account?: unknown;
  name?: unknown;
  kind?: unknown;
  path?: unknown;
  mode?: unknown;
  model?: unknown;
  key?: unknown;
  codexModel?: unknown;
  codexEffort?: unknown;
  openrouterModel?: unknown;
  order?: unknown;
  provider?: unknown;
  enabled?: unknown;
  thinking?: unknown;
  answerTokens?: unknown;
}

const keyActions = ["set-claude", "set-local-model", "set-route-mode", "set-route-account", "set-codex", "reset-codex", "set-openrouter", "clear-openrouter"];
// What is asked of the Claude account list rather than of one work key.
const ACCOUNT_ACTIONS = ["set-account-order", "set-account-enabled", "add-account", "update-account", "remove-account", "choose-account", "clear-account-choice"];
// What the local model's answer may be given. The agency checks it again; this only keeps a malformed
// browser request from travelling.
const ANSWER_TOKENS = [1024, 2048, 4096, 8192];

// The agency owns and validates every fallback row. This route only rejects malformed browser
// requests, then carries the stable work key and provider-specific choice over unchanged.
export default defineEventHandler(async (event): Promise<FallbackChanged> => {
  await requireUserSession(event);

  const body = await readBody<FallbackBody>(event);
  const action = body?.action;
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if ((action === "set-claude" || action === "set-local-model") && model === "") throw fail(400, wording("agents.error.pick_model"));
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const codexModel = typeof body?.codexModel === "string" ? body.codexModel.trim() : "";
  const codexEffort = typeof body?.codexEffort === "string" ? body.codexEffort.trim() : "";
  const openrouterModel = typeof body?.openrouterModel === "string" ? body.openrouterModel.trim() : "";

  // The order belongs to no key. Its shape is checked here and its content by the agency, which knows
  // the providers.
  if (action === "set-provider-order" || action === "reset-provider-order") {
    if (action === "set-provider-order" && !(Array.isArray(body?.order) && (body.order.every((entry) => typeof entry === "string") || body.order.every(entry => entry && typeof entry.name === "string" && typeof entry.enabled === "boolean")))) {
      throw fail(400, wording("agents.error.provider_order_list"));
    }

    return await toAgency({ action, order: action === "set-provider-order" ? body?.order : undefined });
  }

  // The Claude accounts, and the order the Claude Code entry walks them in. The agency owns every
  // refusal; this only stops a malformed browser request from travelling. **A credential is never
  // accepted here** — what an account carries over is the path it is reached by, so no token can
  // pass through this route even if a page tried to send one.
  if (ACCOUNT_ACTIONS.includes(String(action))) {
    if (action === "set-account-order" && !(Array.isArray(body?.order) && (body.order.every((entry) => typeof entry === "string") || body.order.every((entry) => entry && typeof entry.id === "string" && typeof entry.enabled === "boolean")))) {
      throw fail(400, wording("agents.error.account_order_list"));
    }

    if (action === "set-account-enabled" && (typeof body.account !== "string" || typeof body.enabled !== "boolean")) {
      throw fail(400, wording("agents.error.account_switch_needed"));
    }

    if (action === "add-account" && (typeof body.name !== "string" || body.name.trim() === "" || typeof body.path !== "string" || body.path.trim() === "")) {
      throw fail(400, wording("agents.error.account_fields_needed"));
    }

    if ((action === "update-account" || action === "remove-account" || action === "choose-account") && typeof body.account !== "string") {
      throw fail(400, wording("agents.error.pick_account"));
    }

    if (body.kind !== undefined && body.kind !== "directory" && body.kind !== "token") {
      throw fail(400, wording("agents.error.bad_credential_kind"));
    }

    return await toAgency({
      action,
      order: action === "set-account-order" ? body.order : undefined,
      account: typeof body.account === "string" ? body.account : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      kind: body.kind,
      path: typeof body.path === "string" ? body.path : undefined
    });
  }

  if (action === "set-provider-enabled") {
    if (typeof body.provider !== "string" || typeof body.enabled !== "boolean") throw fail(400, wording("agents.error.provider_switch_needed"));
    return await toAgency({ action, provider: body.provider, enabled: body.enabled });
  }
  if (!keyActions.includes(String(action))) throw fail(400, wording("common.error.bad_action"));
  if (action === "set-route-mode" && !isFallbackRouteMode(body.mode)) throw fail(400, wording("agents.error.bad_run_mode"));
  if (key === "") throw fail(400, wording("agents.error.pick_fallback_run"));
  if (action === "set-local-model") {
    if (body.thinking !== undefined && typeof body.thinking !== "boolean") throw fail(400, wording("agents.error.bad_thinking"));
    if (body.answerTokens !== undefined && !ANSWER_TOKENS.includes(body.answerTokens as number)) throw fail(400, wording("agents.error.bad_answer_size"));
  }

  // Which Claude login a key runs on: `auto`, or one account by its id. The agency checks that the
  // account exists and is on.
  if (action === "set-route-account") {
    if (typeof body.account !== "string" || body.account.trim() === "") throw fail(400, wording("agents.error.bad_account_choice"));

    return await toAgency({ action, key, account: body.account.trim() });
  }

  if (action === "set-codex" && (codexModel === "" || codexEffort === "")) {
    throw fail(400, wording("agents.error.pick_codex"));
  }

  if (action === "set-openrouter" && openrouterModel === "") {
    throw fail(400, wording("agents.error.pick_openrouter"));
  }

  return await toAgency(
    {
      action,
      mode: body?.mode,
      thinking: action === "set-local-model" ? body.thinking : undefined,
      answerTokens: action === "set-local-model" ? body.answerTokens : undefined,
      model: model || undefined,
      key: key === "" ? undefined : key,
      codexModel: codexModel === "" ? undefined : codexModel,
      codexEffort: codexEffort === "" ? undefined : codexEffort,
      openrouterModel: openrouterModel === "" ? undefined : openrouterModel,
    }
  );
});

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const truth = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

// One change handed to the agency, which writes it, its refusal said on the screen by the pack's sentence for
// its code. The agency's fixed API takes the change as one PATCH of the fallback's roads.
async function toAgency(sent: Record<string, unknown>): Promise<FallbackChanged> {
  const change: FallbackChange = {
    action: text(sent.action),
    order: sent.order ?? null,
    provider: text(sent.provider),
    enabled: truth(sent.enabled),
    account: text(sent.account),
    name: text(sent.name),
    kind: text(sent.kind),
    path: text(sent.path),
    // An endpoint account's own fields are none the screen sets.
    endpoint: null,
    keyFile: null,
    models: null,
    basePrompt: null,
    // A key's own registration is no road the screen sets.
    registration: null,
    key: text(sent.key),
    mode: text(sent.mode)
  };

  await agencyCall(agency().PATCH("/fallback", { body: change }));

  return { ok: true };
}
