import { refusePairing } from "../../../../utils/account-service";
import { pairingFailure } from "../../../../utils/pairings";

// A pairing refused by the signed-in reader (docs/web.md, 「The desktop pairing page」).
export default defineEventHandler(async (event): Promise<null> => {
  const key = ownerKeyOf(await signedInUser(event)) ?? "";

  try {
    await refusePairing(String(getRouterParam(event, "code") ?? ""), key);
  } catch (error) {
    throw pairingFailure(error);
  }

  setResponseStatus(event, 204);

  return null;
});
