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
  order?: unknown;
  enabled?: unknown;
}

// What the agency's fallback change takes: the Claude account list's own actions, and no road and no route action
// (the agency's `docs/api.md`, 「providers, models and model files」).
const ACCOUNT_ACTIONS = ["set-account-order", "set-account-enabled", "add-account", "update-account", "remove-account", "choose-account", "clear-account-choice"];

// The Claude accounts, and the order the Claude Code entry walks them in. The agency owns every refusal; this only
// stops a malformed browser request from travelling. **A credential is never accepted here** — what an account carries
// over is the path it is reached by, so no token can pass through this route even if a page tried to send one.
export default defineEventHandler(async (event): Promise<FallbackChanged> => {
  await requireUserSession(event);

  const body = await readBody<FallbackBody>(event);
  const action = body?.action;

  if (!ACCOUNT_ACTIONS.includes(String(action))) throw fail(400, wording("common.error.bad_action"));

  if (action === "set-account-order" && !(Array.isArray(body.order) && (body.order.every((entry) => typeof entry === "string") || body.order.every((entry) => entry && typeof entry.id === "string" && typeof entry.enabled === "boolean")))) {
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
});

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const truth = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

// One change handed to the agency, which writes it, its refusal said on the screen by the pack's sentence for its
// code. The agency's fixed API takes the change as one PATCH of the fallback.
async function toAgency(sent: Record<string, unknown>): Promise<FallbackChanged> {
  const change: FallbackChange = {
    action: text(sent.action),
    order: sent.order ?? null,
    provider: null,
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
    registration: null,
    key: null,
    mode: null
  };

  await agencyCall(agency().PATCH("/fallback", { body: change }));

  return { ok: true };
}
