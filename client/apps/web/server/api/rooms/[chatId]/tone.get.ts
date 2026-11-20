import { receiver, receiverCall } from "../../../utils/receiver";

import type { RoomToneView } from "#shared/types";

// A room's tone layer, for the administrator alone: the layer the room is set to and the layers the deployment
// offers (the receiver's `docs/api.md`, 「Rooms」).
export default defineEventHandler(async (event): Promise<RoomToneView> => {
  await requireAdministrator(event);

  const answer = await receiverCall(receiver().GET("/rooms/{roomId}/tone", { params: { path: { roomId: requireChatId(event) } } }));

  return { tone: answer.tone, tones: answer.tones };
});
