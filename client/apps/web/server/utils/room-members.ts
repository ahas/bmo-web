import { wording } from "#shared/wording";

import { AccountRefusal, AccountServiceDown, senderLinks, shownName, userOf } from "./account-service";
import { roomAccounts } from "./console-rooms";
import { fail } from "./fail";
import { RECEIVER_CODES } from "./receiver";
import { unitFetch } from "./units";

import type { RoomChatMembers, RoomMember } from "#shared/types";

// A room's members (docs/web.md, the room screen's members entry; docs/boundary.md, 「Calls the console makes」), by
// either road: the receiver's list of them as the chat service carrying the room read it, with the account service's
// word on which of their person numbers is a console user, and the accounts let into the room in the console. The
// receiver's published document carries neither route, so each call is made on the receiver's address as every unit
// call is, and its answer is read field by field.

// The receiver's refusal of the members read that is a failure, with the pack's key for the sentence a person reads;
// every other code is said as every receiver route says it.
const MEMBER_CODES: Readonly<Record<string, string>> = {
  "members-unheld": "members.error.unheld"
};

// The receiver's refusals that say the room has no chat-service members, which is no failure: no chat service carries
// the room, or its chat service lists no members.
const NO_CHAT_MEMBERS: Readonly<Record<string, Exclude<RoomChatMembers, "listed">>> = {
  "record-only-room": "no-service",
  "members-unlisted": "unlisted"
};

type ReadMember = Omit<RoomMember, "account" | "inConsole">;

/** What a room's chat service gave of its members: its list, and whether it gave one. */
export interface ReceivedMembers {
  members: ReadMember[];
  chatMembers: RoomChatMembers;
}

interface WireMember {
  person?: unknown;
  name?: unknown;
  statusMessage?: unknown;
}

interface WireMembers {
  members?: unknown;
}

function personOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function statusOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// One member as the receiver answered them; a row with no name is no member a person can be shown.
function memberOf(row: WireMember): ReadMember | null {
  if (typeof row.name !== "string" || row.name.trim() === "") return null;

  return { person: personOf(row.person), name: row.name, status: statusOf(row.statusMessage) };
}

/** The room's members as the receiver answers them, its refusal said in the pack's words; none, and why, for a room
 * with no chat-service members. */
export async function receivedMembers(roomId: number): Promise<ReceivedMembers> {
  let answer: WireMembers | null;

  try {
    answer = await unitFetch<WireMembers | null>("RECEIVER", `/rooms/${roomId}/members`, undefined, {
      codes: { ...RECEIVER_CODES, ...MEMBER_CODES }
    });
  } catch (error) {
    const code = (error as { data?: { code?: unknown } | null }).data?.code;
    const none = typeof code === "string" ? NO_CHAT_MEMBERS[code] : undefined;

    if (none !== undefined) return { members: [], chatMembers: none };

    throw error;
  }

  const rows = Array.isArray(answer?.members) ? (answer.members as WireMember[]) : [];

  return { members: rows.flatMap((row) => memberOf(row) ?? []), chatMembers: "listed" };
}

/** The accounts of the members whose person number is linked to a user who may sign in, by person number. */
async function consoleAccounts(people: readonly number[]): Promise<Map<number, string>> {
  try {
    const links = await senderLinks(people);

    return new Map(links.filter((link) => link.signsIn).map((link) => [link.sender, link.user]));
  } catch (error) {
    if (error instanceof AccountServiceDown) throw fail(503, wording("members.error.accounts_failed"));
    if (error instanceof AccountRefusal) throw fail(502, wording("members.error.accounts_failed"));

    throw error;
  }
}

// The names of the accounts let into the room that its chat service does not list, each by the name it is shown by.
async function accountNames(accounts: readonly string[]): Promise<Map<string, string>> {
  try {
    const users = await Promise.all(accounts.map(async (account) => {
      const user = await userOf(account);

      return [account, user === null ? null : shownName(user)] as const;
    }));

    return new Map(users.flatMap(([account, name]) => (name === null ? [] : [[account, name] as const])));
  } catch (error) {
    if (error instanceof AccountServiceDown) throw fail(503, wording("members.error.accounts_failed"));
    if (error instanceof AccountRefusal) throw fail(502, wording("members.error.accounts_failed"));

    throw error;
  }
}

/** A room's members by either road: its chat service's, each marked with the console account they are where the
 * account service knows one, then every account let in in the console that its chat service does not list; and what
 * its chat service gave of them. */
export async function roomMembers(roomId: number): Promise<{ members: RoomMember[]; chatMembers: RoomChatMembers }> {
  const [{ members, chatMembers }, inConsole] = await Promise.all([receivedMembers(roomId), roomAccounts(roomId)]);
  const people = [...new Set(members.flatMap((member) => member.person ?? []))];
  const linked = await consoleAccounts(people);
  const consoleKeys = new Set(inConsole.map((member) => member.account));
  const read = members.map((member) => {
    const account = member.person === null ? null : (linked.get(member.person) ?? null);

    return { ...member, account, inConsole: account !== null && consoleKeys.has(account) };
  });
  const listed = new Set(read.flatMap((member) => member.account ?? []));
  const unlisted = inConsole.filter((member) => !listed.has(member.account)).map((member) => member.account);
  const names = await accountNames(unlisted);

  return {
    members: [
      ...read,
      ...unlisted.flatMap((account) => {
        const name = names.get(account);

        return name === undefined ? [] : [{ person: null, name, status: null, account, inConsole: true }];
      })
    ],
    chatMembers
  };
}
