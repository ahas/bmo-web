import { setRoomCaller } from "../../../../utils/account-service";
import { signedInUser } from "../../../../utils/accounts";
import { callerFailure } from "../../../../utils/callers";
import { letSeveralIntoRoom, letUnitIntoRoom, roomAccounts } from "../../../../utils/console-rooms";
import { fail } from "../../../../utils/fail";
import { requireEntry } from "../../../../utils/room-entry";
import { requireWritableRoom, roomReachChanged } from "../../../../utils/room-reach";
import { unitsPeople } from "../../../../utils/room-units";

import { wording } from "#shared/wording";

// People let into the room by the signed-in login at once (docs/web.md, the room screen's section on opening a room
// and letting people in): the accounts chosen, and the people of each organisation chosen, those already members
// passed over. The account service says who may let whom in, and one refused refuses the whole before the receiver is
// told anything; the receiver keeps the members and writes one line for each organisation and one for the people
// chosen beside them. With `caller` the call into the room is granted to each person let in at the same moment. Each
// person's open streams hear the room from then on.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);

  const body = await readBody<{ accounts?: unknown; units?: unknown; caller?: unknown } | null>(event);
  const accounts = listOf(body?.accounts, (one): one is string => typeof one === "string" && /^\d+$/.test(one));
  const units = listOf(body?.units, (one): one is number => typeof one === "number" && Number.isSafeInteger(one));

  if (accounts === null || units === null || accounts.length + units.length === 0) throw fail(400, wording("members.error.entry_failed"));

  const organisations = await unitsPeople(signed, [...new Set(units)]);

  if (organisations === null) throw fail(403, wording("members.error.entry_forbidden"));

  const standing = new Set((await roomAccounts(room)).map((member) => member.account));
  const fresh = (people: readonly string[]): string[] => [...new Set(people)].filter((account) => !standing.has(account));
  const throughUnits = new Set(organisations.flatMap((unit) => unit.people));
  const alone = fresh(accounts).filter((account) => !throughUnits.has(account));

  await Promise.all(fresh([...alone, ...throughUnits]).map((account) => requireEntry(signed, room, account)));

  const by = String(signed.id);
  const letIn: string[] = [];

  for (const unit of organisations) {
    if (fresh(unit.people).length > 0) letIn.push(...(await letUnitIntoRoom(room, unit.id, by)));
  }
  if (alone.length > 0) letIn.push(...(await letSeveralIntoRoom(room, alone, by)));

  for (const account of letIn) roomReachChanged({ account: Number(account), room, left: false });

  if (body?.caller === true) {
    try {
      await Promise.all(letIn.map((account) => setRoomCaller(room, account, true, by)));
    } catch (error) {
      throw callerFailure(error);
    }
  }

  setResponseStatus(event, 204);
});

// A list whose every member reads as the kind asked; none where it is not a list or holds anything else. An absent
// list is empty.
function listOf<T>(value: unknown, reads: (one: unknown) => one is T): T[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(reads)) return null;

  return value;
}
