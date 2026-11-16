import { bmoPictureOf } from "../../../../../utils/account-service";
import { callerOf } from "../../../../../utils/organization";
import { rosterFailure, rosterPersonAsked } from "../../../../../utils/roster";

// The picture standing for a person's own BMO, theirs or their company's, for the administrator or a head of the
// company they stand in (docs/web.md, 「Organisation」, the people tab).
export default defineEventHandler(async (event): Promise<Uint8Array> => {
  const { signed, person } = await rosterPersonAsked(event);

  try {
    const picture = await bmoPictureOf(person.user, callerOf(signed));

    setResponseHeaders(event, { "content-type": picture.type, "cache-control": "private, no-cache" });

    return picture.bytes;
  } catch (error) {
    throw rosterFailure(error);
  }
});
