import { wording } from "#shared/wording";

import { signedInUser } from "../../utils/accounts";
import { delegateMailServers, mailLinkOf, mailServersFailure } from "../../utils/mail-servers";
import { isDelegation } from "../../utils/organisation-supply";

// What the units below a node may do with its mail servers (docs/web.md, 「Organisation」, the mail servers tab):
// `link` and `delegation`, written on the chain's own route as the signed-in login.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<{ link?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const link = mailLinkOf(body?.link);

  if (!isDelegation(body?.delegation)) throw fail(400, wording("organization.error.bad_request"));

  try {
    await delegateMailServers(link, body.delegation, await signedInUser(event));
  } catch (error) {
    throw mailServersFailure(error);
  }

  return { ok: true };
});
