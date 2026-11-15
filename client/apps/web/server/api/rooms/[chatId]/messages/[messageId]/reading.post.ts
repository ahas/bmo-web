import { signedInUser } from "../../../../../utils/accounts";
import { requireWritableRoom } from "../../../../../utils/room-reach";

import type { BriefingReading } from "#shared/types";

// A line's full reading asked for, as its chip is pressed (the receiver's `docs/api.md`,
// `POST /rooms/{roomId}/messages/{messageId}/reading`): the receiver has the voice engine read the line in its
// agent's voice, or names the reading already made; the chip waits on the briefing it names. A refusal is said in
// its sentence: the whole briefing switched off, an agent with no voice, a line the receiver does not hold, or a
// voice engine it could not reach. Launching a reading writes in the line's room — a turn of the line's agent there
// writing its script, and a briefing the engine keeps for the room — so it is a change of the room: asked as the
// signed-in account, it is refused in a room that is another account's private room, here and by the receiver
// (docs/web.md, 「Access」).
export default defineEventHandler(async (event): Promise<BriefingReading> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);

  const messageId = requireMessageId(event);
  const asked = await unitFetch<{ state?: unknown; briefingId?: unknown }>(
    "RECEIVER",
    `/rooms/${chatId}/messages/${messageId}/reading`,
    { method: "POST", ...(signed.id === null ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify({ account: signed.id }) }) },
    {
      passStatus: [403, 404, 409, 502],
      codes: {
        ...RECEIVER_CODES,
        "switched-off": "briefing.error.switched_off",
        voiceless: "briefing.error.voiceless",
        "not-found": "briefing.error.line_not_found",
        unreachable: "briefing.error.engine_unreachable"
      }
    }
  );

  const briefingId = typeof asked?.briefingId === "number" ? asked.briefingId : null;

  return { state: asked?.state === "ready" && briefingId !== null ? "ready" : "making", briefingId };
});
