import { receiver, receiverCall } from "../../../utils/receiver";

import type { RoomAnswerers } from "#shared/types";

// The agents answering a room, by their own registration names (the receiver's `docs/api.md`, `GET
// /rooms/{roomId}/answerers`): the default answerer, the room's voice, and every agent standing in the room. A
// screen that names these agents — the input box's mention list — reads the name from here and
// what each is called and wears from the agents catalogue, never from a room.
export default defineEventHandler(async (event): Promise<RoomAnswerers> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);
  const answerers = await receiverCall(receiver().GET("/rooms/{roomId}/answerers", { params: { path: { roomId: chatId } } }));

  return {
    default: answerers.default,
    voice: answerers.voice === "" ? null : answerers.voice,
    agents: answerers.items.map((answerer) => ({ name: answerer.agentName }))
  };
});
