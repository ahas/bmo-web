import { signedInUser } from "../../utils/accounts";
import { mailLinkOf, mailServersFailure, nodeMailServers } from "../../utils/mail-servers";

import type { MailServersView } from "#shared/mail-servers";

// A node's mail servers (docs/web.md, 「System and organisation」, the mail servers tab), the link named by `?link=`, `platform` or
// `unit:<id>`: its incoming and outgoing servers, what the units below may do with them and what the reader may change,
// or the word that bmo-mail is not installed. The link stands in the query rather than the path, as the storage tab's
// unit does, so the console's typed routes stay within what the type checker unfolds.
export default defineEventHandler(async (event): Promise<MailServersView> => {
  const link = mailLinkOf(getQuery(event).link);

  try {
    return await nodeMailServers(link, await signedInUser(event));
  } catch (error) {
    throw mailServersFailure(error);
  }
});
