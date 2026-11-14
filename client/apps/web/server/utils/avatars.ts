import { receiver } from "./receiver";
import { unitAt } from "./units";

import type { AvatarKind, AvatarRef } from "#shared/types";

// A room's and a person's profile picture, which the receiver keeps for every chat service and for the console and
// serves by its kind and number (docs/web.md, 「Profile photos」; the receiver's `docs/api.md`, `GET /avatars`,
// `GET /rooms/{roomId}/avatar` and `GET /people/{personId}/avatar`). The receiver is the one road a picture reaches
// the console by: no chat service is asked for one, so a chat service added to the system adds nothing here. The
// console serves it under its own path behind the sign-in, so the browser never names the unit.

const KINDS: readonly string[] = ["room", "person"];

export function isAvatarKind(value: unknown): value is AvatarKind {
  return typeof value === "string" && KINDS.includes(value);
}

// How many pictures one page of the receiver's list carries. The list is one row per room and per person, so a
// page of this size walks it in a few calls.
const AVATAR_PAGE = 200;

// Whether the settings name the receiver: where they do not, no call is made and every screen stands its letters.
function receiverNamed(): boolean {
  return unitAt("RECEIVER") !== null;
}

// Every picture the console can show, read from the receiver's `GET /avatars` a page at a time. A page is walked by
// the moment the last picture on it was taken, oldest first, so no picture is read twice or left behind. A page the
// receiver does not answer ends the walk with what has been read so far: the screens fall back to their letters
// rather than standing empty.
export async function avatarRefs(): Promise<AvatarRef[]> {
  if (!receiverNamed()) return [];

  const refs: AvatarRef[] = [];
  let after: number | null = null;

  for (;;) {
    const query: { limit: number; after?: number } = after === null ? { limit: AVATAR_PAGE } : { limit: AVATAR_PAGE, after };
    let page: { items?: unknown; more?: unknown };

    try {
      const { data } = await receiver().GET("/avatars", { params: { query } });

      if (data === undefined) return refs;

      page = data;
    } catch {
      return refs;
    }

    const items = Array.isArray(page.items) ? (page.items as { kind?: unknown; id?: unknown; takenAt?: unknown }[]) : [];

    for (const item of items) {
      if (!isAvatarKind(item.kind)) continue;
      if (typeof item.id !== "number" || !Number.isSafeInteger(item.id)) continue;
      if (typeof item.takenAt !== "number" || !Number.isFinite(item.takenAt)) continue;

      // The address carries the moment the picture was received, so a browser keeps what it holds until the
      // receiver keeps a new one and the address changes with it.
      refs.push({ kind: item.kind, id: item.id, url: `/api/avatars/${item.kind}/${item.id}?v=${item.takenAt}` });
    }

    if (page.more !== true || items.length === 0) return refs;

    const last = items.at(-1)?.takenAt;

    if (typeof last !== "number" || !Number.isFinite(last) || (after !== null && last <= after)) return refs;

    after = last;
  }
}

// One subject's picture, its bytes and the type the receiver names, or null where the receiver keeps none or is not
// reached.
export interface AvatarPicture {
  bytes: Uint8Array;
  type: string;
}

export async function avatarPicture(kind: AvatarKind, subjectId: number): Promise<AvatarPicture | null> {
  if (!receiverNamed()) return null;

  try {
    const { data, response } =
      kind === "room"
        ? await receiver().GET("/rooms/{roomId}/avatar", { params: { path: { roomId: subjectId } }, parseAs: "arrayBuffer" })
        : await receiver().GET("/people/{personId}/avatar", { params: { path: { personId: subjectId } }, parseAs: "arrayBuffer" });

    if (!response.ok || data === undefined) return null;

    return { bytes: new Uint8Array(data), type: response.headers.get("content-type") ?? "image/jpeg" };
  } catch {
    return null;
  }
}
