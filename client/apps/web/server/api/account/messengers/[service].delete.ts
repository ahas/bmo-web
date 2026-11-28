import { clearMessenger } from "../../../utils/account-service";
import { callerOf } from "../../../utils/organization";

// The signed-in person's messenger account on one chat service taken away (docs/web.md, 「Settings」, the messengers
// section).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await signedInUser(event);

  if (signed.id !== null) await clearMessenger(signed.id, getRouterParam(event, "service") ?? "", callerOf(signed));

  return { ok: true };
});
