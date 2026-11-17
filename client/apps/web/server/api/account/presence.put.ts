import { wording } from "#shared/wording";

import { tellPresenceChanges } from "../../utils/console-presence";
import { presenceSwitches } from "../../utils/presence-switches";

// The logged-in account's switch to show its presence, set as it is switched (docs/web.md, 「Presence and typing」):
// every stream hands the account's presence by it from then on, and the console takes its own word back, or tells
// it again, at once.
export default defineEventHandler(async (event): Promise<{ shown: boolean }> => {
  const signed = await signedInUser(event);
  const body = (await readBody(event)) as { shown?: unknown } | null;
  const shown = body?.shown;

  if (typeof shown !== "boolean") throw fail(400, wording("account.error.bad_presence"));
  if (signed.id === null) throw fail(403, wording("account.error.presence_no_account"));

  await presenceSwitches.set(signed.id, shown, Date.now());
  tellPresenceChanges();

  return { shown };
});
