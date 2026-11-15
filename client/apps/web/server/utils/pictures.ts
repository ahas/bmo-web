import { wording } from "#shared/wording";

import { signedInUser } from "./accounts";
import { acting } from "./console-rooms";
import { fail } from "./fail";
import { ownerHeaders } from "./owner-key";
import { receiverRoute } from "./receiver";
import { requireWritableRoom } from "./room-reach";

import type { H3Event } from "h3";

// A picture the console sets on the receiver's kept pictures, or drops so the provider's stands again (docs/web.md,
// 「Profile photos」; the receiver's `PUT`/`DELETE /avatars/{kind}/{subject}`): a room's, a person's or an agent's,
// each by the subject the receiver numbers or names it by. A room's picture is a change of the room, so another
// account's private room is refused here and by the receiver, which reads the account the change is made as. The
// published client names no account on these routes, so each is asked on its address (docs/boundary.md, 「Gaps the
// console meets」). The receiver's refusals are said by the pack's sentence for each code.

const KINDS = ["room", "person", "agent"] as const;

type PictureKind = (typeof KINDS)[number];

const CODES: Readonly<Record<string, string>> = {
  "picture-too-large": "picture.error.too_large",
  "not-a-picture": "picture.error.not_a_picture",
  "no-picture-given": "picture.error.not_a_picture",
  "no-number": "picture.error.no_number"
};

// A refusal the receiver says for a person — a private room's, a picture too large — travels as its own status.
const PASSED = [403, 413];

/** The subject a picture route names, refused where the kind is none of the three or the subject is no subject; a
 * room's own may not be another account's private room. */
async function subjectOf(event: H3Event): Promise<{ kind: PictureKind; subject: string }> {
  const kind = KINDS.find((one) => one === getRouterParam(event, "kind"));
  const subject = getRouterParam(event, "id") ?? "";

  if (kind === undefined) throw fail(400, wording("room.error.bad_avatar_kind"));
  if (subject === "" || (kind !== "agent" && !/^-?\d+$/.test(subject))) throw fail(400, wording("room.error.bad_avatar_id"));
  if (kind === "room") await requireWritableRoom(event, Number(subject));

  return { kind, subject };
}

function addressOf(kind: PictureKind, subject: string, account: { account?: number }): string {
  const query = account.account === undefined ? "" : `?account=${account.account}`;

  return `/avatars/${kind}/${encodeURIComponent(subject)}${query}`;
}

/** The picture the form carries set for its subject. */
export async function setPicture(event: H3Event): Promise<unknown> {
  const signed = await signedInUser(event);
  const { kind, subject } = await subjectOf(event);
  const picture = ((await readMultipartFormData(event)) ?? []).find((part) => part.name === "picture" && part.filename !== undefined);
  const form = new FormData();

  if (picture === undefined) throw fail(400, wording("picture.error.not_a_picture"));

  form.set("picture", new Blob([new Uint8Array(picture.data)], { type: picture.type ?? "application/octet-stream" }), picture.filename);

  return await receiverRoute(addressOf(kind, subject, acting(signed)), { method: "PUT", body: form, headers: ownerHeaders(signed) }, { passStatus: PASSED, codes: CODES });
}

/** The console's picture of a subject dropped, so the provider's stands again. */
export async function dropPicture(event: H3Event): Promise<unknown> {
  const signed = await signedInUser(event);
  const { kind, subject } = await subjectOf(event);

  return await receiverRoute(addressOf(kind, subject, acting(signed)), { method: "DELETE", headers: ownerHeaders(signed) }, { passStatus: PASSED, codes: CODES });
}
