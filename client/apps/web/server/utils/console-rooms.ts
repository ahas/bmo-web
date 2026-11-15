import { wording } from "#shared/wording";

import { linkSender, listUsers } from "./account-service";
import { fail } from "./fail";
import { administratorKey } from "./owner-key";
import { MESSAGE_IDS, receiverRoute } from "./receiver";

import type { SignedIn } from "./accounts";
import type { ExactMessageId } from "#shared/types";

// The rooms of the console (docs/web.md, 「Access」 and the room screen's section on opening a room and letting people
// in): a room's members are accounts, kept by the receiver, and each account speaks there under an identity of its own
// on the record road, which the account service links to it as any identity is (docs/accounts.md, 「Users and
// senders」). The receiver's published client carries none of these routes, so each is asked on its address and read
// field by field (docs/boundary.md, 「Gaps the console meets」). An account goes on the wire as its key: decimal text
// in a path and a number in a body.

/** A room's member by account: the account, who let them in and when, where the receiver says. */
export interface RoomAccount {
  account: string;
  addedBy: string | null;
  addedAt: number | null;
}

/** A room opened in the console, as the receiver answers it. */
export interface OpenedRoom {
  id: number;
  title: string | null;
}

function keyOf(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);

  return null;
}

// A receiver that serves no such route yet answers 404 `no-route`, and the read stands as none, as the members read's
// does (docs/boundary.md, 「Gaps the console meets」).
function unserved(error: unknown): boolean {
  const failure = error as { statusCode?: unknown; data?: { code?: unknown } | null } | null;

  return failure?.statusCode === 404 && failure.data?.code === "no-route";
}

// A change the receiver refuses in a private room, 403 `private-room`, is said as the refusal it is.
const CHANGES = { passStatus: [403] };

function idsOf(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((one): one is number => typeof one === "number" && Number.isSafeInteger(one)) : [];
}

/** The account's identity on the record road, made where it does not stand and the same one ever after. */
export async function recordIdentity(account: number): Promise<number> {
  const said = await receiverRoute<{ sender?: unknown } | null>(`/accounts/${account}/identity`, { method: "PUT" });

  if (typeof said?.sender !== "number" || !Number.isSafeInteger(said.sender)) {
    throw new Error(`the receiver answered no identity for account ${account}`);
  }

  return said.sender;
}

/** The account's identity on the record road, stood and linked to the account; a link already standing stays. */
export async function standRecordIdentity(account: number): Promise<number> {
  const sender = await recordIdentity(account);

  await linkSender(account, sender);

  return sender;
}

/** The rooms the account is a member of in the console, now. */
export async function accountRooms(account: number): Promise<number[]> {
  try {
    return idsOf((await receiverRoute<{ rooms?: unknown } | null>(`/accounts/${account}/rooms`))?.rooms);
  } catch (error) {
    if (unserved(error)) return [];

    throw error;
  }
}

function accountOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** The account whose private room the room is, as the receiver says it (`privateOf` of its room), or null for every
 * other room: a BMO's own record room is its owner account's, the owner's private chat the owner's account's, and a
 * group room is no one's however many of its members have left. */
export async function privateOf(room: number): Promise<number | null> {
  return accountOf((await receiverRoute<{ privateOf?: unknown } | null>(`/rooms/${room}`))?.privateOf);
}

/** The rooms that are the account's private rooms, as the receiver's room list says each room's `privateOf`. */
export async function privateRoomsOf(account: number): Promise<number[]> {
  const page = await receiverRoute<{ items?: unknown } | null>("/rooms");
  const rooms = Array.isArray(page?.items) ? (page.items as { id?: unknown; privateOf?: unknown }[]) : [];

  return rooms.flatMap((room) => (accountOf(room.privateOf) === account && accountOf(room.id) !== null ? [room.id as number] : []));
}

/** A room's members by account, in the receiver's order. */
export async function roomAccounts(room: number): Promise<RoomAccount[]> {
  let said: { accounts?: unknown } | null;

  try {
    said = await receiverRoute<{ accounts?: unknown } | null>(`/rooms/${room}/accounts`);
  } catch (error) {
    if (unserved(error)) return [];

    throw error;
  }

  const rows = Array.isArray(said?.accounts) ? (said.accounts as { account?: unknown; addedBy?: unknown; addedAt?: unknown }[]) : [];

  return rows.flatMap((row) => {
    const account = keyOf(row.account);

    if (account === null) return [];

    return [{ account, addedBy: keyOf(row.addedBy), addedAt: typeof row.addedAt === "number" ? row.addedAt : null }];
  });
}

/** An account let into a room by another; the receiver writes who let whom in, and letting in again changes nothing. */
export async function letIntoRoom(room: number, account: string, by: string): Promise<void> {
  await receiverRoute(`/rooms/${room}/accounts/${account}`, { method: "PUT", body: { by: Number(by) } }, CHANGES);
}

/** A member taken out of a room by an account, themselves where they leave; the receiver writes who did it. */
export async function takeOutOfRoom(room: number, account: string, by: string): Promise<void> {
  await receiverRoute(`/rooms/${room}/accounts/${account}?by=${encodeURIComponent(by)}`, { method: "DELETE" }, CHANGES);
}

/** A room on the record alone, opened by an account: titled as asked, answered by the supervisor named, the account its
 * first member. */
export async function openRecordRoom(title: string, supervisor: string, openedBy: string): Promise<OpenedRoom> {
  const said = await receiverRoute<{ id?: unknown; title?: unknown } | null>("/rooms", { method: "POST", body: { title, supervisors: [supervisor], openedBy: Number(openedBy) } });

  if (typeof said?.id !== "number" || !Number.isSafeInteger(said.id)) throw new Error("the receiver answered no room");

  return { id: said.id, title: typeof said.title === "string" ? said.title : null };
}

/** Whose words a console send stands under: the signed-in account with the name it is shown by, or the owner's own
 * route for a console login standing before the account model, which is the owner's alone and has no account
 * (docs/web.md, the room screen's input box). Any other login is refused 403, so no account reaches the owner's
 * routes. */
export type Speaker = { account: string; name: string } | "owner";

export function speakerOf(signed: SignedIn): Speaker {
  if (signed.id !== null) return { account: String(signed.id), name: signed.name };
  if (signed.administrator) return "owner";

  throw fail(403, wording("room.error.no_account"));
}

/** Words said in a room by an account, filed under the account's own sender with the name it is shown by; the
 * message's exact id answers. */
export async function sayAsAccount(room: number, speaker: { account: string; name: string }, text: string, replyTo: ExactMessageId | null): Promise<ExactMessageId> {
  const said = await receiverRoute<{ id?: ExactMessageId } | null>(
    `/rooms/${room}/words`,
    { method: "POST", body: { account: Number(speaker.account), name: speaker.name, text, ...(replyTo === null ? {} : { replyTo }) } },
    { ...CHANGES, exactIds: MESSAGE_IDS }
  );

  if (said?.id === undefined) throw fail(502, wording("common.error.not_sent"));

  return said.id;
}

/** Files said in a room by an account, the form as the owner's files route takes it — but for the room, which the
 * path names — with the account and the name it is shown by beside it; the receiver's answer of each file comes back
 * with its message ids exact. */
export async function sayFilesAsAccount<T>(room: number, speaker: { account: string; name: string }, form: FormData): Promise<T> {
  const sent = new FormData();

  for (const [field, value] of form.entries()) {
    if (field !== "chatId") sent.append(field, value);
  }

  sent.set("account", speaker.account);
  sent.set("name", speaker.name);

  return await receiverRoute<T>(`/rooms/${room}/word-files`, { method: "POST", body: sent }, { ...CHANGES, exactIds: MESSAGE_IDS });
}

/** What a pass over every account came to: the accounts whose identity stands linked, and those that failed. */
export interface IdentitiesStood {
  linked: number;
  failed: number;
}

/**
 * Every account's identity on the record road, stood and linked (docs/accounts.md, 「Users and senders」): the users the
 * account service holds, read as the administrator, each given its identity where it has none and linked where it is
 * not; both calls are idempotent, so a pass repeats nothing that stands. One account that fails is written to the log
 * and the rest go on; a list that cannot be read fails the pass whole. Before the account model names an
 * administrator there is no account to stand.
 */
export async function standRecordIdentities(administrator: () => Promise<string | null> = administratorKey): Promise<IdentitiesStood> {
  const key = await administrator();

  if (key === null) return { linked: 0, failed: 0 };

  const users = await listUsers({ key, role: "administrator" });
  const stood: IdentitiesStood = { linked: 0, failed: 0 };

  for (const user of users) {
    try {
      await standRecordIdentity(Number(user.user));
      stood.linked += 1;
    } catch (error) {
      stood.failed += 1;
      console.error(`account ${user.user}: its record identity could not be linked: ${String(error)}`);
    }
  }

  return stood;
}
