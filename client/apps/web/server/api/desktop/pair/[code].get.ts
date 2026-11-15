import { pairingByCode } from "../../../utils/account-service";
import { pairingFailure } from "../../../utils/pairings";

import type { PairingView } from "@web/server-client";

// A pairing as the signed-in reader reads it by its code, with the machine it is for (docs/web.md, 「The desktop
// pairing page」).
export default defineEventHandler(async (event): Promise<PairingView> => {
  const key = ownerKeyOf(await signedInUser(event)) ?? "";

  try {
    return await pairingByCode(String(getRouterParam(event, "code") ?? ""), key);
  } catch (error) {
    throw pairingFailure(error);
  }
});
