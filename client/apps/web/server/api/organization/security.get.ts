import { signedInUser } from "../../utils/accounts";
import { unitNumber } from "../../utils/organization";
import { requirementAt, requirementFailure } from "../../utils/second-factor-chain";

import type { SecondFactorRequirement } from "#shared/account-security";

// Whether a node asks a second factor of its people (docs/web.md, 「System and organisation」, the security tab): a unit named by
// `?unit=`, or the platform by `?link=platform`, as the reader stands to it.
export default defineEventHandler(async (event): Promise<SecondFactorRequirement> => {
  const query = getQuery(event);
  const unit = query.link === "platform" ? null : unitNumber(String(query.unit ?? ""));

  try {
    return await requirementAt(unit, await signedInUser(event));
  } catch (error) {
    throw requirementFailure(error);
  }
});
