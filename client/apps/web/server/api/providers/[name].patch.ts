import { wording } from "#shared/wording";

import type { ProviderView } from "#shared/axes";

// The owner's switch thrown on one provider, for the administrator; the last one on is refused by the agency (its
// `docs/provider-order.md`, 「The owner's switch on a provider」). Or, on a provider that takes one, the workspace its
// requests are spent in: an id, or null for the key's default (its `docs/provider-presence.md`, 「A provider's
// workspace」).
export default defineEventHandler(async (event): Promise<ProviderView> => {
  await requireAdministrator(event);

  const name = axisName(getRouterParam(event, "name"));
  const body = await readBody<{ enabled?: unknown; workspace?: unknown }>(event);

  if (body !== null && typeof body === "object" && "workspace" in body) {
    if (body.workspace !== null && (typeof body.workspace !== "string" || body.workspace.trim() === "")) throw fail(400, wording("common.error.bad_action"));

    return await setProviderWorkspace(name, body.workspace === null ? null : body.workspace.trim());
  }

  if (typeof body?.enabled !== "boolean") throw fail(400, wording("common.error.bad_action"));

  return await switchProvider(name, body.enabled);
});
