import { wording } from "#shared/wording";

import { linkSender, listUsers, shownName, userOf } from "./account-service";
import { fail } from "./fail";
import { onOwnersRoad } from "./owner";
import { moveAdministratorKey } from "./owner-key";
import { MESSAGE_IDS, receiver, receiverCall, receiverRoute } from "./receiver";
import { streamedForm } from "./streamed-forms";

import type { SignedIn } from "./accounts";
import type { SpooledFile } from "./streamed-forms";
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

/** The account's identity on the record road, made where it does not stand and the same one ever after; a name given
 * is the name it goes by from then on every reading of the person, and none leaves the name it goes by as it stands. */
export async function recordIdentity(account: number, name: string | null = null): Promise<number> {
  const said = await receiverRoute<{ sender?: unknown } | null>(`/accounts/${account}/identity`, { method: "PUT", ...(name === null ? {} : { body: { name } }) });

  if (typeof said?.sender !== "number" || !Number.isSafeInteger(said.sender)) {
    throw new Error(`the receiver answered no identity for account ${account}`);
  }

  return said.sender;
}

/** The account's identity on the record road, stood with the name given and linked to the account; a link already
 * standing stays. */
export async function standRecordIdentity(account: number, name: string | null): Promise<number> {
  const sender = await recordIdentity(account, name);

  await linkSender(account, sender);

  return sender;
}

/** The rooms the account is a member of in the console, now. */
export async function accountRooms(account: number): Promise<number[]> {
  try {
    const rooms = (await receiverRoute<{ rooms?: unknown } | null>(`/accounts/${account}/rooms`))?.rooms;

    return Array.isArray(rooms) ? rooms.flatMap((one: unknown) => numberOf(one) ?? []) : [];
  } catch (error) {
    if (unserved(error)) return [];

    throw error;
  }
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** The account a change in a room is made as, the field the receiver reads it by on every room write (its
 * `docs/api.md`, 「Rooms」); none for a console login standing before the account model. */
export function acting(signed: SignedIn): { account?: number } {
  return signed.id === null ? {} : { account: signed.id };
}

/** The administrator a receiver route names as `by`, as the web unit knows him: his user's id, which the receiver
 * asks the web unit's `GET /users/{user}` about; his login for a console login standing before the account model. */
export function administratorBy(signed: SignedIn): string {
  return signed.id === null ? signed.name : String(signed.id);
}

/** The query of a room's removal: who removes it, as the web unit knows him and as his account, and whether it is a
 * preview. */
export function removalQuery(signed: SignedIn, dryRun: boolean): string {
  const query = new URLSearchParams({ by: administratorBy(signed) });

  if (dryRun) query.set("dryRun", "true");
  if (signed.id !== null) query.set("account", String(signed.id));

  return query.toString();
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

/** Several accounts let into a room by another at once, the receiver writing one line for all it let in (its
 * `docs/api.md`, 「Rooms」); the keys it let in, those already members left out. */
export async function letSeveralIntoRoom(room: number, accounts: readonly string[], by: string): Promise<string[]> {
  const said = await receiverCall(receiver().POST("/rooms/{roomId}/accounts", { params: { path: { roomId: room } }, body: { accounts: accounts.map(Number), by: Number(by) } }), CHANGES);

  return said.letIn.map(String);
}

/** An organisation's people let into a room by another, as they stand in it now, the receiver writing one line naming
 * the organisation; the keys it let in, those already members left out. */
export async function letUnitIntoRoom(room: number, unit: number, by: string): Promise<string[]> {
  const said = await receiverCall(receiver().POST("/rooms/{roomId}/unit-accounts", { params: { path: { roomId: room } }, body: { unit, by: Number(by) } }), CHANGES);

  return said.letIn.map(String);
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

/**
 * The name the console hands the receiver for an account: the name it is shown by, read from the account service at
 * each call, so a name its holder or an administrator changed stands on the account's next words whoever's session
 * carried the old one. Where the service does not answer, the login stands, so words are never refused for a name.
 */
export async function accountShownName(account: number, login: string): Promise<string> {
  try {
    const user = await userOf(account);

    return user === null ? login : shownName(user);
  } catch (error) {
    console.warn(`account ${account}: its shown name could not be read, so its login stands: ${String(error)}`);

    return login;
  }
}

/** The name the account is shown by now, read from the account service, for its identity on the record road; none
 * for an account the service does not hold. */
export async function recordNameOf(account: number): Promise<string | null> {
  const user = await userOf(account);

  return user === null ? null : shownName(user);
}

/** The account's identity on the record road named by the name the account is shown by now, so the receiver's every
 * reading of the person names them by it with no words sent; an account the service does not hold is left as it
 * stands. */
export async function nameRecordIdentity(account: number): Promise<void> {
  const name = await recordNameOf(account);

  if (name !== null) await recordIdentity(account, name);
}

/** Whose words a console send stands under: the signed-in account with the name it is shown by, or the owner's own
 * route for a console login standing before the account model, which is the owner's alone and has no account, and for
 * the owner's account while the owner's sender stands linked to none (docs/web.md, the room screen's input box). Any
 * other login is refused 403, so no other account reaches the owner's routes. */
export type Speaker = { account: string; name: string } | "owner";

export async function speakerOf(signed: SignedIn): Promise<Speaker> {
  if (await onOwnersRoad(signed)) return "owner";
  if (signed.id !== null) return { account: String(signed.id), name: await accountShownName(signed.id, signed.name) };

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

/** Files said in a room by the signed-in account, as one send: the owner's on the owner's files route, which the room
 * is named on, and every other account's on the room's own with the account and the name it is shown by. The form
 * goes as a stream read back from the files' scratch copies (docs/web.md, the room screen's input box), and the
 * receiver's answer of each file comes back with its message ids exact. */
export async function sayRoomFiles<T>(room: number, speaker: Speaker, fields: readonly [string, string][], files: readonly SpooledFile[]): Promise<T> {
  if (speaker === "owner") {
    const form = streamedForm([["chatId", String(room)], ...fields], files, "file");

    return await receiverRoute<T>("/owner/message-files", { method: "POST", body: form }, { exactIds: MESSAGE_IDS });
  }

  const form = streamedForm([...fields, ["account", speaker.account], ["name", speaker.name]], files, "file");

  return await receiverRoute<T>(`/rooms/${room}/word-files`, { method: "POST", body: form }, { ...CHANGES, exactIds: MESSAGE_IDS });
}

/** What a pass over every account came to: the accounts whose identity stands linked, and those that failed. */
export interface IdentitiesStood {
  linked: number;
  failed: number;
}

/**
 * Every account's identity on the record road, stood, named and linked (docs/accounts.md, 「Users and senders」): the
 * users the account service holds, read as the administrator, each given its identity where it has none, named by the
 * name it is shown by and linked where it is not; every call is idempotent, so a pass repeats nothing that stands. One account that fails is written to the log
 * and the rest go on; a list that cannot be read fails the pass whole. Before the account model names an
 * administrator there is no account to stand.
 */
export async function standRecordIdentities(administrator: () => Promise<string | null> = moveAdministratorKey): Promise<IdentitiesStood> {
  const key = await administrator();

  if (key === null) return { linked: 0, failed: 0 };

  const users = await listUsers({ key, role: "administrator" });
  const stood: IdentitiesStood = { linked: 0, failed: 0 };

  for (const user of users) {
    try {
      await standRecordIdentity(Number(user.user), shownName(user));
      stood.linked += 1;
    } catch (error) {
      stood.failed += 1;
      console.error(`account ${user.user}: its record identity could not be linked: ${String(error)}`);
    }
  }

  return stood;
}
