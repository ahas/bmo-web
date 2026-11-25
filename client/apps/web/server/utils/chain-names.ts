import { unitView } from "./account-service";

import type { DecidedBy } from "#shared/organisation-agents";

// Who a link of the delegation chain is, as a screen names the link that decided or locked a setting (docs/web.md,
// 「System and organisation」): a unit by its name, the platform, or nobody where no link is named.

/** A link named for a reader: a unit by its name — none where it cannot be read —, the platform, or null. */
export async function unitNamed(link: string | null | undefined): Promise<DecidedBy> {
  if (link === null || link === undefined) return null;
  if (link === "platform") return { by: "platform" };

  const unit = /^unit:(\d+)$/.exec(link)?.[1];

  if (unit === undefined) return { by: "unit", name: null };

  return { by: "unit", name: await unitView(Number(unit)).then((one) => one.name, () => null) };
}
