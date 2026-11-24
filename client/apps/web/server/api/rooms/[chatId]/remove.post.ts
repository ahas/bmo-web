import { removalQuery } from "../../../utils/console-rooms";
import { receiverRoute } from "../../../utils/receiver";
import { removalLeft } from "../../../utils/room-removal";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { RoomRemovalAnswer } from "#shared/types";

// This room's registration removed with its whole record, carried to the receiver under the administrator's name and
// as his account. It waits for the receiver's answer, which waits out the room's turns ending and every holder's part.
// Another account's private room is no room of his to remove: it is refused here and by the receiver (docs/web.md,
// 「Access」).

// What the receiver answers a removal with; the fields the console's screen does not show stand aside.
interface RemovalRead {
  taken?: RoomRemovalAnswer["taken"];
  cleared?: RoomRemovalAnswer["cleared"];
  pictures?: string[];
  folders?: RoomRemovalAnswer["folders"];
  // Each a kind with its path, said here in the pack's sentence for it.
  couldNot?: unknown[];
}

export default defineEventHandler(async (event): Promise<RoomRemovalAnswer> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);

  const answer = await receiverRoute<RemovalRead>(`/rooms/${chatId}?${removalQuery(signed, false)}`, { method: "DELETE" }, { passStatus: [403] });

  return {
    chat: chatId,
    taken: answer.taken ?? [],
    cleared: answer.cleared ?? [],
    pictures: answer.pictures ?? [],
    settings: [],
    folders: answer.folders ?? [],
    copies: [],
    left: removalLeft(answer.couldNot)
  };
});
