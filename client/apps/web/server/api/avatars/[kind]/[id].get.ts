import { drawnStep, WIDTH_FIELD } from "#shared/drawn-pictures";
import { wording } from "#shared/wording";

import { seesAvatar } from "../../../utils/avatar-reach";
import { avatarPicture, isAvatarKind } from "../../../utils/avatars";
import { drawnCopy } from "../../../utils/drawn-pictures";

// A profile picture is served by whose it is, never by a path the browser names. These are personal
// pictures, so they sit behind the same login as everything else here, and a room's behind the room's own reach.
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const kind = getRouterParam(event, "kind") ?? "";
  const id = Number(getRouterParam(event, "id") ?? "");

  if (!isAvatarKind(kind)) {
    throw fail(400, wording("room.error.bad_avatar_kind"));
  }

  if (!Number.isSafeInteger(id)) {
    throw fail(400, wording("room.error.bad_avatar_id"));
  }

  // A room's picture is read by whoever reads the room, and a person's by whoever shares a room with them; anyone else
  // is answered as if it did not stand.
  if (!(await seesAvatar(event, kind, id))) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  const picture = await avatarPicture(kind, id);

  if (picture === null) {
    throw fail(404, wording("room.error.avatar_not_found"));
  }

  // A width asked for is answered with the copy cut to the circle at that step (docs/web.md, 「A picture drawn small」),
  // kept under the moment the address names, since a picture taken later is another picture.
  const query = getQuery(event);
  const step = drawnStep(query[WIDTH_FIELD]);
  const moment = typeof query.v === "string" ? query.v : null;
  const served = step === null || moment === null ? picture : await drawnCopy(`avatar/${kind}/${id}/${moment}`, picture, step, "square");

  // The address carries the moment the picture was taken, so what a browser holds is good until a new
  // one arrives and the address changes with it.
  setResponseHeaders(event, {
    "content-type": served.type,
    "cache-control": "private, max-age=604800, immutable"
  });

  return served.bytes;
});
