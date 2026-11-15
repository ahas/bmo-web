import { askPairing } from "../../../utils/account-service";
import { approveUrl, pairingFailure } from "../../../utils/pairings";

// A pairing asked by the desktop app, with no sign-in, for the address the proxy names (docs/web.md, 「Access」):
// the id the app keeps, the code a person checks, the page the code is approved on, and how long to wait between reads.
export default defineEventHandler(async (event) => {
  try {
    const made = await askPairing(browserAddress(event));

    setResponseStatus(event, 201);

    return { pairing: made.pairing, code: made.code, approveUrl: approveUrl(event, made.code), pollAfterSeconds: made.pollAfterSeconds };
  } catch (error) {
    throw pairingFailure(error);
  }
});
