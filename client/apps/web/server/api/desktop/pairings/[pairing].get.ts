import { readPairing } from "../../../utils/account-service";
import { pairingFailure } from "../../../utils/pairings";

import type { PairingCredential } from "@web/server-client";

// The desktop app's read of its pairing, with no sign-in (docs/web.md, 「Access」): 202 while it waits, and once
// approved the machine and its credential, which the account service answers once. The credential is kept by no
// cache on the way and written to no log.
export default defineEventHandler(async (event): Promise<PairingCredential | null> => {
  let credential: PairingCredential | null;

  try {
    credential = await readPairing(String(getRouterParam(event, "pairing") ?? ""));
  } catch (error) {
    throw pairingFailure(error);
  }

  setResponseHeader(event, "cache-control", "no-store");

  if (credential === null) {
    setResponseStatus(event, 202);

    return null;
  }

  return credential;
});
