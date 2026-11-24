import { signedInUser } from "../../utils/accounts";
import { mailFieldsOf, mailProtocolOf, mailServersFailure, testMailServer } from "../../utils/mail-servers";

import type { MailServerTestView } from "#shared/mail-servers";

// A connection test of the server form (docs/web.md, 「Organisation」, the mail servers tab): bmo-mail reaches the
// server as the form holds it — `protocol`, `host`, `port`, `security` and `tlsName` — and keeps nothing.
export default defineEventHandler(async (event): Promise<MailServerTestView> => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}) as Record<string, unknown>);
  const protocol = mailProtocolOf(body?.protocol);

  try {
    return await testMailServer(protocol, mailFieldsOf(body ?? {}), await signedInUser(event));
  } catch (error) {
    throw mailServersFailure(error);
  }
});
