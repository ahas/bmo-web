import { checkRoom, userOf } from "./account-service";

import { signedInUser } from "./accounts";
import { supervisorsOwnedBy } from "./axes";
import { accountRooms, roomAccounts } from "./console-rooms";
import { ownerChat } from "./owner";
import { receiver, receiverCall } from "./receiver";

import type { SignedIn } from "./accounts";
import type { H3Event } from "h3";

// The rooms a signed-in user reads on the console (docs/web.md, 「Access」): every room for the administrator; for
// anyone else the rooms they read by their account, the union of three — their console memberships, the rooms their
// linked identities reach and hold the console grant in, and their own BMO's private room. A room outside them
// answers as if it did not stand. The same three are the administrator's own rooms, beside his private chat; every
// other room he reads leaves nothing its people can see.

/** Every room, or the ones a user may read. */
export type ReadableRooms = "all" | ReadonlySet<number>;

// The rooms any of the senders has stood as a sender in, as the receiver's room list names each room's senders
// (the receiver's `docs/api.md`, 「The rooms」).
async function roomsSpokenIn(senders: readonly number[]): Promise<number[]> {
  const page = await receiverCall(receiver().GET("/rooms"));
  const ours = new Set(senders);

  return page.items.filter((room) => room.senders.some((sender) => ours.has(sender))).map((room) => room.id);
}

// The rooms the account's linked identities reach — where one has a message, and the one-to-one each is — in which
// the account holds the console grant.
async function linkedRooms(account: number, administrator: boolean): Promise<number[]> {
  const senders = [...((await userOf(account))?.senders ?? [])].sort((one, other) => one - other);

  if (senders.length === 0) return [];

  const reached = new Set([...(await roomsSpokenIn(senders)), ...senders]);

  if (administrator) return [...reached];

  const readable: number[] = [];

  for (const room of reached) {
    if ((await checkRoom(room, senders[0]!, "console")).allowed) readable.push(room);
  }

  return readable;
}

// Whether a room is one account's private room: carried by no chat service, and holding no account but that one.
async function heldAlone(room: number, account: number): Promise<boolean> {
  const [providers, members] = await Promise.all([
    receiverCall(receiver().GET("/rooms/{roomId}/providers", { params: { path: { roomId: room } } })),
    roomAccounts(room)
  ]);

  return providers.providers.length === 0 && members.every((member) => member.account === String(account));
}

/** The account's own BMO's private rooms: the record rooms a supervisor it owns answers alone, holding no other
 * account (docs/web.md, 「Access」). */
export async function privateRoomsOf(account: number): Promise<number[]> {
  const rooms: number[] = [];
  // An agency that does not answer hides the private room until it does, and leaves every other room readable.
  const owned = await supervisorsOwnedBy(account).catch(() => []);

  for (const supervisor of owned) {
    const answered = await receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: supervisor.name } } }));

    for (const room of answered.items) {
      if (room.alone && !rooms.includes(room.id) && (await heldAlone(room.id, account))) rooms.push(room.id);
    }
  }

  return rooms;
}

/** The account whose private room with their own BMO a room is, or null where it is no one's: a record room whose
 * leaders are one account, holding no other account. */
export async function privateRoomOwner(room: number): Promise<number | null> {
  const leaders = (await receiverCall(receiver().GET("/rooms/{roomId}/leaders", { params: { path: { roomId: room } } }))).leaders;
  const owner = leaders.length === 1 ? leaders[0]! : null;

  return owner !== null && (await heldAlone(room, owner)) ? owner : null;
}

/** The rooms an account reads as any person does: its console memberships, its linked identities' rooms and its own
 * BMO's private rooms; the administrator's private chat is his own beside them. */
export async function ownRooms(signed: SignedIn): Promise<ReadonlySet<number>> {
  if (signed.id === null) {
    const chat = signed.administrator ? await ownerChat() : null;

    return new Set(chat === null ? [] : [chat]);
  }

  const [memberships, linked, alone, chat] = await Promise.all([
    accountRooms(signed.id),
    linkedRooms(signed.id, signed.administrator),
    privateRoomsOf(signed.id),
    signed.administrator ? ownerChat() : Promise.resolve(null)
  ]);

  return new Set([...memberships, ...linked, ...alone, ...(chat === null ? [] : [chat])]);
}

export async function readableRooms(event: H3Event): Promise<ReadableRooms> {
  const held = event.context.readableRooms as ReadableRooms | undefined;

  if (held !== undefined) return held;

  const signed = await signedInUser(event);
  const rooms: ReadableRooms = signed.administrator ? "all" : await ownRooms(signed);

  event.context.readableRooms = rooms;

  return rooms;
}

/** A room the signed-in user may read, or a refusal answering as if it did not stand. */
export async function requireReadableRoom(event: H3Event, chatId: number): Promise<void> {
  const rooms = await readableRooms(event);

  if (rooms !== "all" && !rooms.has(chatId)) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }
}

/** Whether a room is the signed-in user's own: one they read by their account, never the administrator's reach alone. */
export async function isOwnRoom(event: H3Event, chatId: number): Promise<boolean> {
  const rooms = await readableRooms(event);

  if (rooms !== "all") return rooms.has(chatId);

  const held = event.context.ownRooms as ReadonlySet<number> | undefined;
  const own = held ?? (await ownRooms(await signedInUser(event)));

  event.context.ownRooms = own;

  return own.has(chatId);
}

/**
 * A room the signed-in user may change something of, refused 403 where it is another person's private room with
 * their own BMO: the administrator reads every room and changes nothing of another's (docs/web.md, 「Access」). A
 * member reads no such room, so the read refusal answers them first; a console login standing before the account
 * model is the owner's, and no person's private room stands beside it.
 */
export async function requireWritableRoom(event: H3Event, chatId: number): Promise<void> {
  await requireReadableRoom(event, chatId);

  const signed = await signedInUser(event);

  if (!signed.administrator || signed.id === null || (await isOwnRoom(event, chatId))) return;

  const owner = await privateRoomOwner(chatId);

  if (owner !== null && owner !== signed.id) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
}
