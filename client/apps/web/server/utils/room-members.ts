import { wording } from "#shared/wording";

import { AccountRefusal, AccountServiceDown, senderLinks } from "./account-service";
import { fail } from "./fail";
import { RECEIVER_CODES } from "./receiver";
import { unitFetch } from "./units";

import type { RoomMember } from "#shared/types";

// A room's members (docs/web.md, the room screen's members entry; docs/boundary.md, 「Calls the console makes」): the
// receiver's list of them, as the chat service carrying the room read it, and the account service's word on which of
// their person numbers is a console user. The receiver's published document carries no members route, so the call
// is made on the receiver's address as every unit call is, and its answer is read field by field.

// The receiver's refusals of the members read, each with the pack's key for the sentence a person reads; every other
// code is said as every receiver route says it.
const MEMBER_CODES: Readonly<Record<string, string>> = {
  "not-found": "members.error.not_filled",
  "no-route": "members.error.not_served"
};

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
function memberOf(row: WireMember): Omit<RoomMember, "account"> | null {
  if (typeof row.name !== "string" || row.name.trim() === "") return null;

  return { person: personOf(row.person), name: row.name, status: statusOf(row.statusMessage) };
}

/** The room's members as the receiver answers them, its refusal said in the pack's words. */
export async function receivedMembers(roomId: number): Promise<Omit<RoomMember, "account">[]> {
  const answer = await unitFetch<WireMembers | null>("RECEIVER", `/rooms/${roomId}/members`, undefined, {
    codes: { ...RECEIVER_CODES, ...MEMBER_CODES }
  });
  const rows = Array.isArray(answer?.members) ? (answer.members as WireMember[]) : [];

  return rows.flatMap((row) => memberOf(row) ?? []);
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

/** A room's members, each marked with the console account they are where the account service knows one. */
export async function roomMembers(roomId: number): Promise<RoomMember[]> {
  const members = await receivedMembers(roomId);
  const people = [...new Set(members.flatMap((member) => member.person ?? []))];
  const accounts = await consoleAccounts(people);

  return members.map((member) => ({ ...member, account: member.person === null ? null : (accounts.get(member.person) ?? null) }));
}
