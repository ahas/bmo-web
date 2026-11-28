import { messengersOf } from "../../utils/account-service";
import { callerOf } from "../../utils/organization";

import type { MessengerView } from "../../utils/account-service";

// The signed-in person's messenger accounts, each chat service with whether their organisation lets them use it
// (docs/web.md, 「Settings」, the messengers section).
export default defineEventHandler(async (event): Promise<{ items: MessengerView[] }> => {
  const signed = await signedInUser(event);

  if (signed.id === null) return { items: [] };

  return { items: await messengersOf(signed.id, callerOf(signed)) };
});
