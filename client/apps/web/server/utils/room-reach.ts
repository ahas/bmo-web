import { ROOM_REACH_REFRESH_MS } from "#shared/config";
import { wording } from "#shared/wording";

import { checkRoom, userOf } from "./account-service";

import { signedInUser } from "./accounts";
import { accountRooms, privateOf } from "./console-rooms";
import { fail } from "./fail";
import { ownerChat } from "./owner";
import { administratorKey } from "./owner-key";
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

/** The rooms an account reads as any person does: its console memberships, its own BMO's private rooms among them,
 * and its linked identities' rooms; the administrator's private chat is his own beside them. */
export async function ownRooms(signed: SignedIn): Promise<ReadonlySet<number>> {
  if (signed.id === null) {
    const chat = signed.administrator ? await ownerChat() : null;

    return new Set(chat === null ? [] : [chat]);
  }

  // The receiver's memberships hold the account's private rooms beside the rooms it was let into or opened.
  const [memberships, linked, chat] = await Promise.all([
    accountRooms(signed.id),
    linkedRooms(signed.id, signed.administrator),
    signed.administrator ? ownerChat() : Promise.resolve(null)
  ]);

  return new Set([...memberships, ...linked, ...(chat === null ? [] : [chat])]);
}

/** A change of the rooms an account reads, made through the console: a room it was let into or opened, or one it
 * left, was taken out of or lost the call grant of. */
export interface ReachChange {
  account: number;
  room: number;
  left: boolean;
}

const reachListeners = new Set<(change: ReachChange) => void>();

/** Says to every open stream that an account's rooms changed. */
export function roomReachChanged(change: ReachChange): void {
  for (const listener of reachListeners) {
    try {
      listener(change);
    } catch {
      // One stream's fault is no reason to keep the change from the others.
    }
  }
}

/**
 * The rooms an open stream's reader reads, kept as they stand while the stream is open (docs/web.md, 「Access」): read
 * again whenever a change of the reader's account's rooms is said, a room it left or was taken out of dropped at once
 * so nothing more of it is heard, and read again every `ROOM_REACH_REFRESH_MS` for what changes elsewhere. A read that
 * fails keeps the rooms as they stood, its drops among them.
 */
export class LiveRooms {
  private rooms: ReadonlySet<number>;
  // Rooms dropped by a change, each with the change that dropped it, kept out until a read begun after it lands.
  private readonly dropped = new Map<number, number>();
  private changes = 0;
  private reading: Promise<void> | null = null;
  private again = false;

  constructor(private readonly signed: SignedIn, rooms: ReadonlySet<number>) {
    this.rooms = rooms;
  }

  has(room: number): boolean {
    return this.rooms.has(room);
  }

  /** Waits for the read under way, where one is. */
  async settled(): Promise<void> {
    await this.reading;
  }

  /** Follows the changes said and the clock until the returned stop is called. */
  follow(refreshMs: number = ROOM_REACH_REFRESH_MS): () => void {
    const listener = (change: ReachChange): void => {
      if (change.account !== this.signed.id) return;

      if (change.left) this.drop(change.room);
      else this.refresh();
    };
    const timer = setInterval(() => this.refresh(), refreshMs);

    reachListeners.add(listener);

    return () => {
      reachListeners.delete(listener);
      clearInterval(timer);
    };
  }

  private drop(room: number): void {
    this.changes += 1;
    this.dropped.set(room, this.changes);
    this.rooms = new Set([...this.rooms].filter((one) => one !== room));
    this.refresh();
  }

  private refresh(): void {
    if (this.reading !== null) {
      this.again = true;

      return;
    }

    this.reading = this.readWhileAsked().finally(() => {
      this.reading = null;
    });
  }

  private async readWhileAsked(): Promise<void> {
    do {
      this.again = false;

      const begun = this.changes;

      try {
        const rooms = await ownRooms(this.signed);

        for (const [room, at] of this.dropped) {
          if (at <= begun) this.dropped.delete(room);
        }

        this.rooms = new Set([...rooms].filter((room) => !this.dropped.has(room)));
      } catch (error) {
        console.warn(`the rooms of ${this.signed.name} were not read again: ${String(error)}`);
      }
    } while (this.again);
  }
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

/** The account a signed-in login changes a room as: its own, or the administrator's account for a console login
 * standing before the account model, which is the owner's; null where the model names no administrator yet. */
export async function actingAccount(signed: SignedIn, administrator: () => Promise<string | null> = administratorKey): Promise<number | null> {
  if (signed.id !== null) return signed.id;

  const key = signed.administrator ? await administrator() : null;

  return key === null ? null : Number(key);
}

/**
 * A room the signed-in user may change something of, refused 403 where it is another account's private room as the
 * receiver says (its `privateOf`): the administrator reads every room and changes nothing of another's (docs/web.md,
 * 「Access」). The receiver refuses the same change by the account each write names; this refusal stands before it,
 * and is the only one for a console login standing before the account model, whose writes name no account.
 */
export async function requireWritableRoom(event: H3Event, chatId: number): Promise<void> {
  await requireReadableRoom(event, chatId);

  const owner = await privateOf(chatId);

  if (owner !== null && owner !== (await actingAccount(await signedInUser(event)))) {
    throw fail(403, wording("room.error.private_room"));
  }
}
