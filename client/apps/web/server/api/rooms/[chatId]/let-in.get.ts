import { signedInUser } from "../../../utils/accounts";
import { companyMembers, searchPeople } from "../../../utils/account-service";
import { ownerKeyOf, ownerRoleOf } from "../../../utils/owner-key";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { PersonView } from "#shared/people";

// The people this reader may let into the room, as the account service's own rule for letting in answers them
// (docs/accounts.md, 「A room's callers」; docs/web.md, the room screen's section on opening a room and letting
// people in): no words answer the whole set the reader may let in, and words search that set. A login with no
// user of the model may let nobody in and reads nobody. The room's own members are left out by the dialog, which
// shows them already standing there.
export default defineEventHandler(async (event): Promise<PersonView[]> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const key = ownerKeyOf(signed);

  if (key === null) return [];

  const caller = { key, role: ownerRoleOf(signed) };
  const asked = getQuery(event).q;
  const words = typeof asked === "string" ? asked.trim() : "";

  if (words === "") {
    return (await companyMembers(chatId, caller)).map((member) => ({
      user: member.user,
      name: member.name,
      organization: "",
      jobTitle: ""
    }));
  }

  return await searchPeople(words, chatId, caller);
});
