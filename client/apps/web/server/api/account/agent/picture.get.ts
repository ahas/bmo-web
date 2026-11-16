import { bmoPictureOf } from "../../../utils/account-service";
import { bmoFailure } from "../../../utils/bmo-routes";
import { callerOf } from "../../../utils/organization";

// The picture standing for the signed-in person's own BMO, theirs or their company's (docs/web.md, 「Settings」, the
// own-BMO section).
export default defineEventHandler(async (event): Promise<Uint8Array> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw bmoFailure(new Error("no user"));

  try {
    const picture = await bmoPictureOf(signed.id, callerOf(signed));

    setResponseHeaders(event, { "content-type": picture.type, "cache-control": "private, no-cache" });

    return picture.bytes;
  } catch (error) {
    throw bmoFailure(error);
  }
});
