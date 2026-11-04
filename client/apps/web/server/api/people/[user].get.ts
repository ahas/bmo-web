import { personOf } from "../../utils/account-service";
import { signedInUser } from "../../utils/accounts";
import { fail } from "../../utils/fail";
import { ownerKeyOf, ownerRoleOf } from "../../utils/owner-key";
import { wording } from "#shared/wording";

import type { PersonView } from "#shared/people";

// One person of the reader's own organisation, as a person's page reads them (docs/accounts.md, 「The people
// directory」). The contact details stand only for the platform administrator and the person themselves.
export default defineEventHandler(async (event): Promise<PersonView> => {
  const signed = await signedInUser(event);
  const key = ownerKeyOf(signed);
  const user = getRouterParam(event, "user") ?? "";

  if (key === null) throw fail(404, wording("people.error.not_found"));

  const person = await personOf(user, { key, role: ownerRoleOf(signed) });

  if (person === null) throw fail(404, wording("people.error.not_found"));

  return person;
});
