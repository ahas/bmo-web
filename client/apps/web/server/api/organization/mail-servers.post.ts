import { signedInUser } from "../../utils/accounts";
import { addMailServer, mailFieldsOf, mailLinkOf, mailProtocolOf, mailServersFailure } from "../../utils/mail-servers";

// A new mail server kept at a node (docs/web.md, 「System and organisation」, the mail servers tab): `link`, `protocol` and the
// server's fields, judged by bmo-mail, which writes the link's list on the chain in the reader's name.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}) as Record<string, unknown>);
  const link = mailLinkOf(body?.link);
  const protocol = mailProtocolOf(body?.protocol);

  try {
    await addMailServer(link, protocol, mailFieldsOf(body ?? {}), await signedInUser(event));
  } catch (error) {
    throw mailServersFailure(error);
  }

  return { ok: true };
});
