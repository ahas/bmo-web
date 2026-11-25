import { companyMembers } from "../../utils/account-service";
import { CONSOLE_PEOPLE_SERVICE, bundleOfPage, pageNames } from "../../utils/console-manifests";
import { ownerKeyOf, ownerRoleOf } from "../../utils/owner-key";

// The members of the reader's company, the service the console answers itself under the name `people`
// (docs/web.md, 「Screens a unit brings」; docs/accounts.md, 「The people directory」): each person's account key
// and name, nothing more, so a bundle's share picker finds and shows a person with no other read. A request with no
// session is refused, and a bundle's page reaches it only where its manifest names the service under `calls`; the
// page is the address the browser sends as the call's referrer. A login with no user of the model has no company
// and reads nobody.
export default defineEventHandler(async (event): Promise<{ members: { user: string; name: string }[] }> => {
  const signed = await signedInUser(event);
  const page = bundleOfPage(useRuntimeConfig(event).app.baseURL, getRequestHeader(event, "referer"));

  if (!pageNames(page, CONSOLE_PEOPLE_SERVICE)) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const key = ownerKeyOf(signed);

  if (key === null) return { members: [] };

  return { members: await companyMembers(null, { key, role: ownerRoleOf(signed) }) };
});
