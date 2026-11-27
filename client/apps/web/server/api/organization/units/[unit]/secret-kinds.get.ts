import { AccountRefusal, listSecretKinds, resolveChain } from "../../../../utils/account-service";
import { unitNumber } from "../../../../utils/organization";
import { offeredKinds, secretFailure } from "../../../../utils/secrets";

import type { SecretKindList } from "#shared/secret-kinds";

// The kinds the secret form at a company's or a unit's node is offered (docs/web.md, 「System and organisation」,
// the secrets tab): the deployment's registry, narrowed to what the chain leaves the unit under `secret.kinds`. A
// resolution that names no keys, and one the service cannot give because the kind stands nowhere, leave every kind
// offered, exactly as the store's own write check reads a value the link may keep (docs/accounts.md,
// 「Secret kinds」); only a failed registry read is told as one.

const CHAIN_KIND = "secret.kinds";

// What the chain leaves standing for the unit, `undefined` where it says nothing or declares no such kind.
async function resolutionFor(unit: number): Promise<unknown> {
  try {
    return (await resolveChain(CHAIN_KIND, { unit })).value;
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 404) return undefined;

    throw error;
  }
}

export default defineEventHandler(async (event): Promise<SecretKindList> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  await signedInUser(event);

  try {
    const [registry, resolution] = await Promise.all([listSecretKinds(), resolutionFor(unit)]);

    return { kinds: offeredKinds(registry, resolution) };
  } catch (error) {
    throw secretFailure(error, "secrets.error.kinds_read_failed");
  }
});
