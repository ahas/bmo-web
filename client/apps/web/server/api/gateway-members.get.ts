import { agencyRoute } from "../utils/agency";
import { unitNamed } from "../utils/chain-names";

import type { GatewayMember } from "#shared/supply";

// The agency's model gateway members, each with its road and its owner (the agency's `docs/api.md`,
// 「providers, models and model files」), for the administrator's providers tab to say whose a road is (docs/web.md,
// 「System and organisation」, the providers tab). The agency reads a member their own members and those of the units
// they head; this tab stands at the platform's link alone, so the call is the deployment's own and answers every one;
// the published client names no type for it, so it is asked by its documented path.
export default defineEventHandler(async (event): Promise<GatewayMember[]> => {
  await requireAdministrator(event);

  const answer = await agencyRoute<{ items?: Partial<GatewayMember>[] }>("GET", "/gateway-members");
  const named = new Map<string, Promise<string | null>>();

  // Each owning unit is read by its name once, however many members stand under it.
  const unitName = (unit: string): Promise<string | null> => {
    if (!named.has(unit)) named.set(unit, unitNamed(`unit:${unit}`).then((who) => (who?.by === "unit" ? who.name : null)));

    return named.get(unit)!;
  };
  const members = (answer.items ?? []).filter((one) => typeof one.name === "string");

  return await Promise.all(
    members.map(async (one): Promise<GatewayMember> => {
      const unit = one.unit === null || one.unit === undefined ? null : String(one.unit);

      return {
        name: one.name as string,
        road: one.road ?? null,
        label: one.label ?? (one.name as string),
        provider: one.provider ?? "",
        account: one.account === null || one.account === undefined ? null : String(one.account),
        unit,
        unitLabel: unit === null ? null : await unitName(unit)
      };
    })
  );
});
