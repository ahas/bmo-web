import { ROOM_REACH_REFRESH_MS } from "#shared/config";
import { wording } from "#shared/wording";

import { checkRoom, userOf } from "./account-service";

import { signedInUser } from "./accounts";
import { SHARED, accountRooms, privacyOf, readableBy, roomPrivacies, writableBy } from "./console-rooms";
import { fail } from "./fail";
import { onOwnersRoad, ownerChat, ownerStanding } from "./owner";
import { receiver, receiverCall } from "./receiver";

import type { SignedIn } from "./accounts";
import type { RoomPrivacy } from "./console-rooms";
import type { OwnerStanding } from "./owner";
import type { H3Event } from "h3";

// The rooms a signed-in user reads on the console (docs/web.md, 「Access」): every room for the administrator; for
// anyone else the rooms they read by their account, the union of three — their console memberships, the rooms their
// linked identities reach and hold the console grant in, and their own BMO's private room. A room outside them
// answers as if it did not stand. The same three are the administrator's own rooms; every other room he reads, the
// owner's private chat among them where his account is not the owner's, leaves nothing its people can see.

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

/** The rooms an account reads as any person does: its console memberships, its own private rooms among them — the
 * owner's private chat for the owner's account alone, as the receiver answers them — and its linked identities' rooms,
 * each held to whose private room it is now, so a membership never outlives its room becoming another's or sealed. The
 * owner's private chat is the owner's account's own, the moment the console stands it (docs/accounts.md, 「The owner's
 * account」), and a console login standing before the account model, which is the owner's, holds it alone. */
export async function ownRooms(signed: SignedIn): Promise<ReadonlySet<number>> {
  if (signed.id === null) {
    const chat = signed.administrator ? await ownerChat() : null;

    return new Set(chat === null ? [] : [chat]);
  }

  // The receiver's memberships hold the account's private rooms beside the rooms it was let into or opened; of the
  // rooms its identities reach, another account's private room and a sealed one are no rooms of its own.
  const account = signed.id;
  const [memberships, linked, privacies, owner] = await Promise.all([
    accountRooms(account),
    linkedRooms(account, signed.administrator),
    roomPrivacies(),
    signed.administrator ? ownerStanding() : Promise.resolve(null)
  ]);
  const own = [...memberships, ...linked].filter((room) => readableBy(privacies.get(room) ?? SHARED, account));
  const chat = owner?.account === account ? await ownerChat() : null;

  return new Set([...own, ...(chat === null ? [] : [chat])]);
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
 * so nothing more of it is heard, and read again every `ROOM_REACH_REFRESH_MS` for what changes elsewhere. Each read
 * asks again who the reader is: a login that no longer stands, or one that is no longer what it was when the stream
 * opened — the administrator no more, or the administrator now — loses the stream, and so does a read that cannot be
 * made, since rooms that cannot be confirmed are no rooms to hear. A stream lost hears no room from then on.
 */
export class LiveRooms {
  private rooms: ReadableRooms;
  // Rooms dropped by a change, each with the change that dropped it, kept out until a read begun after it lands.
  private readonly dropped = new Map<number, number>();
  private changes = 0;
  private reading: Promise<void> | null = null;
  private again = false;
  private lost: (() => void) | null = null;
  // Once lost, the stream hears no room again, whatever a later read would say.
  private gone = false;

  /** `standing` answers who the stream's login is now, and fails where its login no longer stands. */
  constructor(private readonly signed: SignedIn, rooms: ReadableRooms, private readonly standing: () => Promise<SignedIn>) {
    this.rooms = rooms;
  }

  has(room: number): boolean {
    return this.rooms === "all" || this.rooms.has(room);
  }

  /** Waits for the read under way, where one is. */
  async settled(): Promise<void> {
    await this.reading;
  }

  /** Follows the changes said and the clock until the returned stop is called; `lost` is called once where the
   * stream's rooms can no longer be confirmed. */
  follow(lost: () => void, refreshMs: number = ROOM_REACH_REFRESH_MS): () => void {
    const listener = (change: ReachChange): void => {
      if (change.account !== this.signed.id) return;

      if (change.left) this.drop(change.room);
      else this.refresh();
    };
    const timer = setInterval(() => this.refresh(), refreshMs);

    this.lost = lost;
    reachListeners.add(listener);

    return () => {
      this.lost = null;
      reachListeners.delete(listener);
      clearInterval(timer);
    };
  }

  private drop(room: number): void {
    this.changes += 1;
    this.dropped.set(room, this.changes);

    if (this.rooms !== "all" && !this.gone) this.rooms = new Set([...this.rooms].filter((one) => one !== room));

    this.refresh();
  }

  private refresh(): void {
    if (this.gone) return;

    if (this.reading !== null) {
      this.again = true;

      return;
    }

    this.reading = this.readWhileAsked().finally(() => {
      this.reading = null;
    });
  }

  private lose(why: string): void {
    console.warn(`the stream of ${this.signed.name} was let go: ${why}`);
    this.gone = true;
    this.rooms = new Set();
    this.lost?.();
    this.lost = null;
  }

  private async readWhileAsked(): Promise<void> {
    do {
      this.again = false;

      const begun = this.changes;

      try {
        const now = await this.standing();

        if (now.id !== this.signed.id || now.administrator !== this.signed.administrator) return this.lose("its login is no longer what it was");
        if (now.administrator) continue;

        const rooms = await ownRooms(now);

        for (const [room, at] of this.dropped) {
          if (at <= begun) this.dropped.delete(room);
        }

        this.rooms = new Set([...rooms].filter((room) => !this.dropped.has(room)));
      } catch (error) {
        return this.lose(`its rooms could not be read again: ${String(error)}`);
      }
    } while (this.again);
  }
}

/** What of a room tells whether it is the deployment's own: the mode it was added in from the add dialog, none where
 * it was not, and whether the owner allowed it with his allow command. */
export interface DeploymentMarks {
  mode: string | null;
  listened: boolean;
}

/** Whether a room is the deployment's own rather than any account's (docs/web.md, 「Access」): added in a mode or
 * allowed by the owner's allow command, and neither someone's private room nor sealed. */
export function isDeploymentRoom(room: DeploymentMarks, privacy: RoomPrivacy): boolean {
  return (room.mode !== null || room.listened) && privacy.privateOf === null && !privacy.sealed;
}

/** The rooms the administrator's everyday lists hold (docs/web.md, 「Access」): his own and the deployment's, never a
 * room he reaches only as the administrator. */
export async function administratorsRooms(signed: SignedIn): Promise<ReadonlySet<number>> {
  const [own, every, privacies] = await Promise.all([ownRooms(signed), receiverCall(receiver().GET("/rooms")), roomPrivacies()]);
  const deployment = every.items.filter((room) => isDeploymentRoom(room, privacies.get(room.id) ?? SHARED)).map((room) => room.id);

  return new Set([...own, ...deployment]);
}

/** The rooms a reader's lists hold: a member's are the rooms they read, the administrator's his own and the
 * deployment's. Held for the request. */
export async function listedRooms(event: H3Event): Promise<ReadonlySet<number>> {
  const held = event.context.listedRooms as ReadonlySet<number> | undefined;

  if (held !== undefined) return held;

  const rooms = await readableRooms(event);
  const listed = rooms === "all" ? await administratorsRooms(await signedInUser(event)) : rooms;

  event.context.listedRooms = listed;

  return listed;
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

/** The account a signed-in login changes a room as: its own, or for a console login standing before the account model,
 * which writes on the owner's own road, the owner's account where the owner's sender stands linked to one, and none
 * where it stands linked to none — the same account the receiver takes the owner's road to act for. */
export async function actingAccount(signed: SignedIn, standing: () => Promise<OwnerStanding> = ownerStanding): Promise<number | null> {
  if (signed.id !== null) return signed.id;
  if (!signed.administrator) return null;

  const owner = await standing();

  return owner.linked ? owner.account : null;
}

/**
 * A room the signed-in user may change something of, refused 403 where it is another account's private room or a sealed
 * one as the receiver says (its `privateOf` and `sealed`): the administrator reads every room and changes nothing of another's (docs/web.md,
 * 「Access」). The receiver refuses the same change by the account each write names; this refusal stands before it,
 * and is the only one for a console login standing before the account model, whose writes name no account.
 */
export async function requireWritableRoom(event: H3Event, chatId: number): Promise<void> {
  await requireReadableRoom(event, chatId);

  if (!(await mayChangeRoom(event, chatId))) throw fail(403, wording("room.error.private_room"));
}

/** Whether the signed-in user may change a room they read: any room but another account's private room or a sealed
 * one, as the receiver says it. */
export async function mayChangeRoom(event: H3Event, chatId: number): Promise<boolean> {
  return await changeJudge(await signedInUser(event))(chatId, await privacyOf(chatId));
}

/** How a login's changes are judged room by room, by the room's privacy: every room no one's goes, and any other as
 * its acting account's; a login on the owner's own road — a console login standing before the account model, and the
 * owner's account while his sender stands linked to none — writes in his own private chat always, sealed or not, and
 * in another private room only as the owner's linked account, never while it is unlinked (the receiver's
 * `docs/receiver.md`, 「Console rooms and accounts」). Who the login acts as is asked only where a room is
 * someone's. */
export function changeJudge(signed: SignedIn, standing: () => Promise<OwnerStanding> = ownerStanding): (room: number, privacy: RoomPrivacy) => Promise<boolean> {
  let account: Promise<number | null> | null = null;
  let road: Promise<boolean> | null = null;
  let ownChat: Promise<number | null> | null = null;

  // The owner's account while his sender stands linked to none speaks on his road, which acts for no account.
  const actsAs = async (): Promise<number | null> => (signed.id !== null && (await (road ??= onOwnersRoad(signed, standing))) ? null : await actingAccount(signed, standing));

  return async (room, privacy) => {
    if (privacy.privateOf === null && !privacy.sealed) return true;
    if ((await (road ??= onOwnersRoad(signed, standing))) && room === (await (ownChat ??= ownerChat()))) return true;

    return writableBy(privacy, await (account ??= actsAs()));
  };
}
