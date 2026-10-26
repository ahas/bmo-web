import { wording } from "#shared/wording";

// A profile picture is served by whose it is, never by a path the browser names. These are personal
// pictures, so they sit behind the same login as everything else here.
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

  const picture = await avatarPicture(kind, id);

  if (picture === null) {
    throw fail(404, wording("room.error.avatar_not_found"));
  }

  // The address carries the moment the picture was taken, so what a browser holds is good until a new
  // one arrives and the address changes with it.
  setResponseHeaders(event, {
    "content-type": picture.type,
    "cache-control": "private, max-age=604800, immutable"
  });

  return picture.bytes;
});
