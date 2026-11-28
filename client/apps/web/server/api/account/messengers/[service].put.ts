import { wording } from "#shared/wording";

import { setMessenger } from "../../../utils/account-service";
import { callerOf } from "../../../utils/organization";

import type { MessengerAccountView } from "../../../utils/account-service";

// The signed-in person's messenger account on one chat service set: their own login, or the one signed in on their
// node (docs/web.md, 「Settings」, the messengers section).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await signedInUser(event);
  const service = getRouterParam(event, "service") ?? "";
  const body = await readBody<Partial<MessengerAccountView>>(event);

  if (signed.id === null) throw fail(403, wording("messengers.error.no_user"));
  if (body?.mode !== "own" && body?.mode !== "node") throw fail(400, wording("messengers.error.bad_mode"));

  const handle = typeof body.handle === "string" && body.handle.trim() !== "" ? body.handle.trim() : undefined;

  await setMessenger(signed.id, service, { mode: body.mode, handle }, callerOf(signed));

  return { ok: true };
});
