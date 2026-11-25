import { listRooms } from "../../../../utils/archive";
import { roomPrivacies, SHARED } from "../../../../utils/room-privacy";
import { ownRooms } from "../../../../utils/room-reach";
import { rosterPersonForAdministrator } from "../../../../utils/roster";

import type { RosterRoom } from "#shared/roster";

// The rooms a person reads by their account, the latest first, for the administrator alone (docs/web.md,
// 「Organisation」, the people tab): their console memberships, their linked identities' rooms and their own BMO's
// private room, as any person's are read (「Access」).
export default defineEventHandler(async (event): Promise<RosterRoom[]> => {
  const person = await rosterPersonForAdministrator(event);
  const account = Number(person.user);
  const [own, listed, privacies] = await Promise.all([ownRooms({ name: person.login, id: account, administrator: false }), listRooms(), roomPrivacies()]);

  return listed
    .filter((room) => own.has(room.chatId))
    .map((room): RosterRoom => ({
      chatId: room.chatId,
      title: room.title,
      kind: (privacies.get(room.chatId) ?? SHARED).privateOf === account ? "private" : "group",
      messageCount: room.messageCount,
      lastMessageAt: room.lastMessageAt
    }))
    .sort((one, other) => (other.lastMessageAt ?? 0) - (one.lastMessageAt ?? 0));
});
