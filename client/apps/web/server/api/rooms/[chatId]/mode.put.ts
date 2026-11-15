import { wording } from "#shared/wording";

import { acting } from "../../../utils/console-rooms";
import { receiverRoute } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { RoomMode, RoomModeView } from "#shared/types";

const MODES: readonly RoomMode[] = ["avatar", "record-only"];

// A room's mode set, for the administrator alone, under the administrator's name and as his account: the receiver
// changes the mode and leaves the room's record, title and providers as they stand. Another account's private room is
// refused here and by the receiver (docs/web.md, 「Access」); the published client names no account on the route, so it
// is asked on its address (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<RoomModeView> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ mode?: unknown }>(event);
  const mode = MODES.find((one) => one === body?.mode);

  if (mode === undefined) throw fail(400, wording("room.error.mode_save_failed"));

  await requireWritableRoom(event, chatId);

  const answer = await receiverRoute<unknown>(
    `/rooms/${chatId}/registration?${new URLSearchParams({ by: signed.name })}`,
    { method: "PUT", body: { mode, ...acting(signed) } },
    { passStatus: [403] }
  );

  return { mode: modeOf(answer) };
});
