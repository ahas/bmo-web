import { approvePairing } from "../../../../utils/account-service";
import { pairingFailure } from "../../../../utils/pairings";

import type { PairingApproved } from "@web/server-client";

// A pairing approved by the signed-in reader for their own machine (docs/web.md, 「The desktop pairing page」).
export default defineEventHandler(async (event): Promise<PairingApproved> => {
  const key = ownerKeyOf(await signedInUser(event)) ?? "";

  try {
    return await approvePairing(String(getRouterParam(event, "code") ?? ""), key);
  } catch (error) {
    throw pairingFailure(error);
  }
});
