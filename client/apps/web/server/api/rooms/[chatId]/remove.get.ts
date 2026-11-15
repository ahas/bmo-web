import { removalQuery } from "../../../utils/console-rooms";
import { receiverRoute } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { RoomRemovalPreview } from "#shared/types";

// What removing this room's registration would take and leave, read by the receiver with nothing written, for the
// administrator alone. It asks every holder and counts the room's files, and waits for that answer however long it
// takes under load. Another account's private room is no room of his to remove, so it is refused before anything is
// asked (docs/web.md, 「Access」).

// The answer the receiver gives a removal, preview or carried out; the fields the console's screen does not show
// stand aside.
interface RemovalRead {
  goes?: RoomRemovalPreview["goes"];
  stays?: RoomRemovalPreview["stays"];
  pictures?: string[];
  settings?: RoomRemovalPreview["settings"];
  folders?: RoomRemovalPreview["folders"];
  warned?: string[];
}

export default defineEventHandler(async (event): Promise<RoomRemovalPreview> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);

  const answer = await receiverRoute<RemovalRead>(`/rooms/${chatId}?${removalQuery(signed, true)}`, { method: "DELETE" }, { passStatus: [403] });

  return {
    chat: chatId,
    refused: null,
    warnings: answer.warned ?? [],
    goes: answer.goes ?? [],
    stays: answer.stays ?? [],
    pictures: answer.pictures ?? [],
    settings: answer.settings ?? { taken: [], undeclared: [] },
    folders: answer.folders ?? [],
    copies: []
  };
});
