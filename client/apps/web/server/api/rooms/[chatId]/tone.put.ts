import { wording } from "#shared/wording";

import { acting, administratorBy } from "../../../utils/console-rooms";
import { ADMINISTRATOR_ONLY, receiverRoute } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { RoomToneView } from "#shared/types";

// A room's tone layer set, for the administrator alone, as the web unit knows him and as his account: a layer
// the deployment offers, or null for none, which the receiver judges. Another account's private room is refused here
// and by the receiver (docs/web.md, 「Access」); the published client names no account on the route, so it is asked
// on its address (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<RoomToneView> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ tone?: unknown }>(event);
  const tone = body?.tone;

  if (tone !== null && typeof tone !== "string") throw fail(400, wording("room_info.error.tone_save_failed"));

  await requireWritableRoom(event, chatId);

  const answer = await receiverRoute<RoomToneView>(
    `/rooms/${chatId}/tone?${new URLSearchParams({ by: administratorBy(signed) })}`,
    { method: "PUT", body: { tone, ...acting(signed) } },
    { passStatus: [403], codes: ADMINISTRATOR_ONLY }
  );

  return { tone: answer.tone, tones: answer.tones };
});
