import { wording } from "#shared/wording";

import type { ProviderView } from "#shared/axes";

// The owner's switch thrown on one provider, for the administrator; the last one on is refused by the agency (its
// `docs/provider-order.md`, 「The owner's switch on a provider」).
export default defineEventHandler(async (event): Promise<ProviderView> => {
  await requireAdministrator(event);

  const name = axisName(getRouterParam(event, "name"));
  const body = await readBody<{ enabled?: unknown }>(event);

  if (typeof body?.enabled !== "boolean") throw fail(400, wording("common.error.bad_action"));

  return await switchProvider(name, body.enabled);
});
