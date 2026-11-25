import { searchPeople } from "../../utils/account-service";
import { signedInUser } from "../../utils/accounts";
import { ownerKeyOf, ownerRoleOf } from "../../utils/owner-key";

import type { PersonView } from "#shared/people";

// The people of the reader's own organisation whose name, organisation, job title or permitted contact holds
// the words (docs/accounts.md, 「The people directory」). The account service holds the organisation and the
// fields each reader may see; a login with no user of the model finds nobody.
export default defineEventHandler(async (event): Promise<PersonView[]> => {
  const signed = await signedInUser(event);
  const key = ownerKeyOf(signed);
  const asked = getQuery(event).q;

  if (key === null || typeof asked !== "string" || asked.trim() === "") return [];

  return await searchPeople(asked, null, { key, role: ownerRoleOf(signed) });
});
