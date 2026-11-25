import { receiverRoute } from "./receiver";

// Whose private room each room is, as the receiver keeps it (docs/web.md, 「Access」): a light read of the receiver's
// room list and of one room, which the room list, the faces and every reach judgement share.

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Whose private room a room is, as the receiver keeps it on every room it reads (its `docs/api.md`, 「Rooms」):
 * `privateOf`, the account whose private room it is, or null for every other room — a group room is no one's however
 * many of its members have left, and a room once an account's stays that account's — and `sealed`, a private room whose
 * account is not known yet, such as the owner's private chat before his sender is linked to an account. */
export interface RoomPrivacy {
  privateOf: number | null;
  sealed: boolean;
}

/** Every room that is no one's private room, a group room among them. */
export const SHARED: RoomPrivacy = { privateOf: null, sealed: false };

function privacyIn(view: { privateOf?: unknown; sealed?: unknown } | null | undefined): RoomPrivacy {
  return { privateOf: numberOf(view?.privateOf), sealed: view?.sealed === true };
}

/** Whether an account may change a room of this privacy: any room but another account's private room or a sealed
 * one. A login with no account changes no private room. */
export function writableBy(privacy: RoomPrivacy, account: number | null): boolean {
  return !privacy.sealed && (privacy.privateOf === null || privacy.privateOf === account);
}

/** Whether an account other than the administrator may read a room of this privacy: the same rooms it may change,
 * since nobody but its own account and the administrator reads a private room, and only the administrator a sealed
 * one. */
export function readableBy(privacy: RoomPrivacy, account: number): boolean {
  return writableBy(privacy, account);
}

/** Whose private room a room is, as the receiver's read of the room says it. */
export async function privacyOf(room: number): Promise<RoomPrivacy> {
  return privacyIn(await receiverRoute<{ privateOf?: unknown; sealed?: unknown } | null>(`/rooms/${room}`));
}

/** Every private or sealed room with its privacy, as the receiver's room list says it; a room it does not name there
 * is no one's. */
export async function roomPrivacies(): Promise<Map<number, RoomPrivacy>> {
  const page = await receiverRoute<{ items?: unknown } | null>("/rooms");
  const held = new Map<number, RoomPrivacy>();

  for (const room of roomsIn(page?.items)) {
    if (room.privacy.privateOf !== null || room.privacy.sealed) held.set(room.id, room.privacy);
  }

  return held;
}

/** The rooms that are the account's private rooms. */
export async function privateRoomsOf(account: number): Promise<number[]> {
  return [...(await roomPrivacies())].flatMap(([room, privacy]) => (privacy.privateOf === account ? [room] : []));
}

// The rooms of the receiver's room list, each by its id with its privacy beside it.
function roomsIn(value: unknown): { id: number; privacy: RoomPrivacy }[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((one: unknown) => {
    const view = typeof one === "object" && one !== null ? (one as { id?: unknown; privateOf?: unknown; sealed?: unknown }) : null;
    const id = numberOf(view?.id);

    return id === null ? [] : [{ id, privacy: privacyIn(view) }];
  });
}
