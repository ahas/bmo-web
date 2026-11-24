import { signedInUser } from "../../utils/accounts";
import { mailServerIdOf, mailServersFailure, removeMailServer } from "../../utils/mail-servers";

// A kept mail server removed (docs/web.md, 「Organisation」, the mail servers tab), named by `?id=`; refused while an
// account stands on it.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const id = mailServerIdOf(getQuery(event).id);

  try {
    await removeMailServer(id, await signedInUser(event));
  } catch (error) {
    throw mailServersFailure(error);
  }

  return { ok: true };
});
