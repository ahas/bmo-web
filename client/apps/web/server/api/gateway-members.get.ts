import { agencyRoute } from "../utils/agency";

import type { GatewayMember } from "#shared/supply";

// The agency's model gateway members, each with its road and the account it belongs to (the agency's `docs/api.md`,
// 「providers, models and model files」), for the administrator's providers tab to say whose a road is (docs/web.md,
// 「Administration」, the providers tab). No route opens it to a member, so it answers the administrator alone; the
// published client names no type for it, so it is asked by its documented path.
export default defineEventHandler(async (event): Promise<GatewayMember[]> => {
  await requireUserSession(event);

  const answer = await agencyRoute<{ items?: Partial<GatewayMember>[] }>("GET", "/gateway-members");

  return (answer.items ?? []).flatMap((one) =>
    typeof one.name === "string"
      ? [{ name: one.name, road: one.road ?? null, label: one.label ?? one.name, provider: one.provider ?? "", account: one.account === null || one.account === undefined ? null : String(one.account) }]
      : []
  );
});
