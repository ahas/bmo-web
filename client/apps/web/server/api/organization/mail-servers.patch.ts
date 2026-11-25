import { signedInUser } from "../../utils/accounts";
import { changeMailServer, mailFieldsOf, mailServerIdOf, mailServersFailure } from "../../utils/mail-servers";

// A kept mail server changed (docs/web.md, 「System and organisation」, the mail servers tab): `id` and the fields that change;
// its protocol stays. The server stands in the body for the reason the read's link stands in its query.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}) as Record<string, unknown>);
  const id = mailServerIdOf(body?.id);

  try {
    await changeMailServer(id, mailFieldsOf(body ?? {}), await signedInUser(event));
  } catch (error) {
    throw mailServersFailure(error);
  }

  return { ok: true };
});
