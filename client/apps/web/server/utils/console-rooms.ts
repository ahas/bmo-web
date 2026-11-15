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
// field by field (docs/boundary.md, 「Gaps the console meets」). An account goes on the wire as its key's decimal text.

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
  await receiverRoute(`/rooms/${room}/accounts/${account}`, { method: "PUT", body: { by } });
}

/** A member taken out of a room by an account, themselves where they leave; the receiver writes who did it. */
export async function takeOutOfRoom(room: number, account: string, by: string): Promise<void> {
  await receiverRoute(`/rooms/${room}/accounts/${account}?by=${encodeURIComponent(by)}`, { method: "DELETE" });
}

/** A room on the record alone, opened by an account: titled as asked, answered by the supervisor named, the account its
 * first member. */
export async function openRecordRoom(title: string, supervisor: string, openedBy: string): Promise<OpenedRoom> {
  const said = await receiverRoute<{ id?: unknown; title?: unknown } | null>("/rooms", { method: "POST", body: { title, supervisors: [supervisor], openedBy } });

  if (typeof said?.id !== "number" || !Number.isSafeInteger(said.id)) throw new Error("the receiver answered no room");

  return { id: said.id, title: typeof said.title === "string" ? said.title : null };
}

/** Whose words a console send stands under: the signed-in account, or the owner's own route for a console login
 * standing before the account model, which is the owner's alone and has no account (docs/web.md, the room screen's
 * input box). Any other login is refused 403, so no account reaches the owner's routes. */
export type Speaker = { account: string } | "owner";

export function speakerOf(signed: SignedIn): Speaker {
  if (signed.id !== null) return { account: String(signed.id) };
  if (signed.administrator) return "owner";

  throw fail(403, wording("room.error.no_account"));
}

/** Words said in a room by an account, filed under the account's own sender; the message's exact id answers. */
export async function sayAsAccount(room: number, account: string, text: string, replyTo: ExactMessageId | null): Promise<ExactMessageId> {
  const said = await receiverRoute<{ id?: ExactMessageId } | null>(
    `/rooms/${room}/words`,
    { method: "POST", body: { account, text, ...(replyTo === null ? {} : { replyTo }) } },
    { exactIds: MESSAGE_IDS }
  );

  if (said?.id === undefined) throw fail(502, wording("common.error.not_sent"));

  return said.id;
}

/** Files said in a room by an account, the form as the owner's files route takes it with `account` beside it; the
 * receiver's answer of each file comes back with its message ids exact. */
export async function sayFilesAsAccount<T>(room: number, form: FormData): Promise<T> {
  return await receiverRoute<T>(`/rooms/${room}/word-files`, { method: "POST", body: form }, { exactIds: MESSAGE_IDS });
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
