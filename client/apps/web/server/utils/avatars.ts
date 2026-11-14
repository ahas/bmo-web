import { unitAt, unitHeaders } from "./units";

import type { AvatarKind, AvatarRef } from "#shared/types";

import type { UnitAddress } from "./units";

// A room's and a person's profile picture, which the archive and each chat service keep and serve by its kind and
// id (docs/web.md, 「Profile photos」; the receiver's, the Telegram service's and the KakaoTalk service's
// `docs/api.md`, `GET /avatars`, `GET /rooms/{roomId}/avatar` and `GET /people/{personId}/avatar`). The console
// serves it under its own path behind the sign-in, so the browser never names the unit.

// The units that keep pictures, in the order a number two keep is read from: the receiver first, since it is the
// archive, then the Telegram service and the KakaoTalk service.
const KEEPERS: readonly string[] = ["RECEIVER", "TELEGRAM", "KAKAOTALK"];

function keepers(): UnitAddress[] {
  return KEEPERS.flatMap((name) => unitAt(name) ?? []);
}

const KINDS: readonly string[] = ["room", "person"];

export function isAvatarKind(value: unknown): value is AvatarKind {
  return typeof value === "string" && KINDS.includes(value);
}

// How many pictures one page of the provider's list carries. The list is one row per room and per
// person, so a page of this size walks it in a few calls.
const AVATAR_PAGE = 200;

interface AvatarPage {
  items?: unknown;
  more?: unknown;
}

interface AvatarRow {
  kind?: unknown;
  id?: unknown;
  takenAt?: unknown;
}

// Every picture the console can show: each keeper's list, joined, the earlier keeper's picture standing for a
// number both keep.
export async function avatarRefs(): Promise<AvatarRef[]> {
  const lists = await Promise.all(keepers().map(listedBy));
  const seen = new Set<string>();

  return lists.flat().filter((ref) => {
    const subject = `${ref.kind}:${ref.id}`;

    if (seen.has(subject)) return false;

    seen.add(subject);

    return true;
  });
}

// One keeper's pictures, read from its `GET /avatars` a page at a time. A page is walked by the moment the last
// picture on it was taken, oldest first, so no picture is read twice or left behind. A page the keeper does not
// answer ends the walk with what has been read so far: the screens fall back to their letters rather than
// standing empty.
async function listedBy(unit: UnitAddress): Promise<AvatarRef[]> {
  const refs: AvatarRef[] = [];
  let after: number | null = null;

  for (;;) {
    const query = new URLSearchParams({ limit: String(AVATAR_PAGE) });

    if (after !== null) query.set("after", String(after));

    let page: AvatarPage;

    try {
      const response = await fetch(`${unit.address}/avatars?${query}`, { headers: unitHeaders(unit) });

      if (!response.ok) return refs;

      page = (await response.json()) as AvatarPage;
    } catch {
      return refs;
    }

    const items: AvatarRow[] = Array.isArray(page.items) ? (page.items as AvatarRow[]) : [];

    for (const item of items) {
      if (!isAvatarKind(item.kind)) continue;
      if (typeof item.id !== "number" || !Number.isSafeInteger(item.id)) continue;
      if (typeof item.takenAt !== "number" || !Number.isFinite(item.takenAt)) continue;

      // The address carries the moment the picture was received, so a browser keeps what it holds
      // until the provider receives a new one and the address changes with it.
      refs.push({ kind: item.kind, id: item.id, url: `/api/avatars/${item.kind}/${item.id}?v=${item.takenAt}` });
    }

    if (page.more !== true || items.length === 0) return refs;

    const last = items.at(-1)?.takenAt;

    if (typeof last !== "number" || !Number.isFinite(last) || (after !== null && last <= after)) return refs;

    after = last;
  }
}

// One subject's picture, its bytes and the type its keeper names, as the first keeper that keeps one serves it, or
// null where none keeps one or none is reached.
export interface AvatarPicture {
  bytes: Uint8Array;
  type: string;
}

export async function avatarPicture(kind: AvatarKind, subjectId: number): Promise<AvatarPicture | null> {
  const path = kind === "room" ? `/rooms/${subjectId}/avatar` : `/people/${subjectId}/avatar`;

  for (const unit of keepers()) {
    try {
      const response = await fetch(`${unit.address}${path}`, { headers: unitHeaders(unit) });

      if (response.ok) {
        return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "image/jpeg" };
      }
    } catch {
      // This keeper is not reached; the next one may keep the picture.
    }
  }

  return null;
}
