import { userOf } from "./account-service";
import { signedInUser } from "./accounts";
import { agency, agencyCall } from "./agency";
import { agentFaces } from "./agent-faces";
import { supervisorOwner } from "./axes";
import { roomAccounts } from "./console-rooms";
import { receiver, receiverCall } from "./receiver";
import { readableRooms } from "./room-reach";

import type { SignedIn } from "./accounts";
import type { ReadableRooms } from "./room-reach";
import type { AvatarKind } from "#shared/types";
import type { H3Event } from "h3";

// Whose profile pictures a signed-in user sees (docs/web.md, 「Profile photos」): the administrator every one; anyone
// else the pictures of what they share and nothing else — the rooms they read (「Access」), the people who share one
// of those rooms with them, as a sender who has stood in it or an account that is its member, their own identities,
// and the chat agents they see, their own and the deployment's. A picture outside it answers as if it did not stand,
// so nobody learns another company's people or rooms from the list of pictures.

/** The pictures a reader sees: every one, or the rooms and the people named. */
export type AvatarReach = "all" | { rooms: ReadonlySet<number>; people: ReadonlySet<number> };

// The people an account sees, kept a short while for the rooms it was read for, since every picture a screen draws
// asks again.
const KEPT_MS = 30_000;
const kept = new Map<number, { at: number; rooms: string; people: Promise<ReadonlySet<number>> }>();

// The senders an account's identities are, none where the account service does not answer.
async function sendersOf(account: number): Promise<readonly number[]> {
  return (await userOf(account).catch(() => null))?.senders ?? [];
}

/** The people `account` shares something with: every sender that has stood in a room of `rooms`, the identities of
 * every account a member of one of them, its own identities, and the person number each chat agent it sees speaks
 * under — the supervisors filed under it and those filed under no account. */
export async function peopleSeenBy(account: number, rooms: ReadonlySet<number>): Promise<ReadonlySet<number>> {
  const [listed, supervisors, faces, own] = await Promise.all([
    receiverCall(receiver().GET("/rooms")).then((page) => page.items, () => []),
    agencyCall(agency().GET("/supervisors")).then((page) => page.items, () => []),
    agentFaces().catch(() => []),
    sendersOf(account)
  ]);
  const people = new Set<number>(own);

  for (const room of listed) {
    if (rooms.has(room.id)) for (const sender of room.senders) people.add(sender);
  }

  const members = new Set<number>();

  for (const room of rooms) {
    for (const member of await roomAccounts(room).catch(() => [])) members.add(Number(member.account));
  }

  members.delete(account);

  for (const member of members) {
    for (const sender of await sendersOf(member)) people.add(sender);
  }

  const seen = new Set(
    supervisors
      .filter((supervisor) => {
        const owner = supervisorOwner(supervisor);

        return owner === null || owner === account;
      })
      .map((supervisor) => supervisor.name)
  );

  for (const face of faces) {
    if (seen.has(face.name) && face.personId !== null) people.add(face.personId);
  }

  return people;
}

/** The people a signed-in user sees, given the rooms they read; kept a short while for the same rooms. */
export async function peopleSeen(signed: SignedIn, rooms: ReadonlySet<number>, now: number = Date.now()): Promise<ReadonlySet<number>> {
  if (signed.id === null) return new Set();

  const account = signed.id;
  const signature = [...rooms].sort((one, other) => one - other).join(",");
  const held = kept.get(account);

  if (held !== undefined && held.rooms === signature && now - held.at < KEPT_MS) return await held.people;

  const people = peopleSeenBy(account, rooms);

  kept.set(account, { at: now, rooms: signature, people });
  people.catch(() => kept.delete(account));

  return await people;
}

/** The pictures a signed-in user sees, given the rooms they read. */
export async function avatarReachOf(signed: SignedIn, rooms: ReadableRooms): Promise<AvatarReach> {
  if (rooms === "all") return "all";

  return { rooms, people: await peopleSeen(signed, rooms) };
}

/** The pictures the request's signed-in user sees, held for the request. */
export async function avatarReach(event: H3Event): Promise<AvatarReach> {
  const held = event.context.avatarReach as AvatarReach | undefined;

  if (held !== undefined) return held;

  const reach = await avatarReachOf(await signedInUser(event), await readableRooms(event));

  event.context.avatarReach = reach;

  return reach;
}

/** Whether a reach holds a subject's picture. */
export function reaches(reach: AvatarReach, kind: AvatarKind, id: number): boolean {
  if (reach === "all") return true;

  return kind === "room" ? reach.rooms.has(id) : reach.people.has(id);
}

/** Whether the request's signed-in user sees one subject's picture: a room's by the rooms they read alone, a person's
 * by the people they share a room with. */
export async function seesAvatar(event: H3Event, kind: AvatarKind, id: number): Promise<boolean> {
  const rooms = await readableRooms(event);

  if (rooms === "all") return true;
  if (kind === "room") return rooms.has(id);

  return (await peopleSeen(await signedInUser(event), rooms)).has(id);
}
