import { wording } from "#shared/wording";

import type { RoomMode, RoomModeView } from "#shared/types";

const MODES: readonly RoomMode[] = ["avatar", "record-only"];

// A room's mode set, for the administrator alone, under the administrator's name: the receiver changes the mode and
// leaves the room's record, title and providers as they stand.
export default defineEventHandler(async (event): Promise<RoomModeView> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ mode?: unknown }>(event);
  const mode = MODES.find((one) => one === body?.mode);

  if (mode === undefined) throw fail(400, wording("room.error.mode_save_failed"));

  const answer = await receiverCall(
    receiver().PUT("/rooms/{roomId}/registration", { params: { path: { roomId: chatId }, query: { by: signed.name } }, body: { mode } })
  );

  return { mode: modeOf(answer) };
});
