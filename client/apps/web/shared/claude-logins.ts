import type { Translate } from "./wording";

// What a Claude login is called on a screen (docs/web.md, 「System and organisation」, the supply tab). The agency names every login it
// is asked to name one number past every login the platform holds, so the number standing in that name counts other
// accounts' logins among them; a screen numbers the logins of one account against each other instead, from 01.
//
// This changes nothing of what a login is called inside the agency or how it is addressed: the name, the id and the
// credential path are read as the agency wrote them and go back as they came. Only the label a person reads is
// derived here, and where it cannot be derived the stored name stands.

/** One login as the numbering reads it: what it is addressed by, what it is called, and whose it is. */
export interface LoginRow {
  id: string;
  name: string;
  // The person the login belongs to, or null where it is the platform's own. Absent where the screen is not told
  // whose it is, which is not the same as the platform's.
  userId?: number | string | null;
}

// The name the agency gives a login it names itself: `claude-` and the number it counted to.
const NUMBERED_NAME = /^claude-0*([1-9][0-9]*)$/;

/** The owner key of the logins no person owns, which are the platform's own. */
export const PLATFORM_OWNER = "platform";

/** The number the agency put in a login's name, or null where its name carries none. */
export function namedLoginNumber(name: string): number | null {
  const counted = NUMBERED_NAME.exec(name.trim());

  return counted === null ? null : Number(counted[1]);
}

/** The account a login belongs to, as the screen is told it: a person by their number, the platform where no person
 * owns it, or null where the screen is not told whose it is. */
export function loginOwnerKey(login: LoginRow): string | null {
  if (login.userId === undefined) return null;

  return login.userId === null ? PLATFORM_OWNER : `user:${String(login.userId)}`;
}

/** The logins of one account, which is what a number is counted against. */
export function loginsOfOwner(logins: readonly LoginRow[], owner: string | null): LoginRow[] {
  if (owner === null) return [];

  return logins.filter((one) => loginOwnerKey(one) === owner);
}

/** Each numbered login's own number, by its id: the logins of one account stood in the order the agency's numbers
 * run and counted from one. A login whose name numbers nothing, and one whose owning account is untold, holds no
 * number and keeps the name it is stored under. */
export function loginNumbers(logins: readonly LoginRow[]): Map<string, number> {
  const ofOwner = new Map<string, LoginRow[]>();

  for (const login of logins) {
    const owner = loginOwnerKey(login);

    if (owner === null || namedLoginNumber(login.name) === null) continue;

    const own = ofOwner.get(owner);

    if (own === undefined) ofOwner.set(owner, [login]);
    else own.push(login);
  }

  const numbers = new Map<string, number>();

  for (const own of ofOwner.values()) {
    own.sort((one, other) => (namedLoginNumber(one.name) ?? 0) - (namedLoginNumber(other.name) ?? 0));
    own.forEach((login, index) => numbers.set(login.id, index + 1));
  }

  return numbers;
}

/** The number a login the agency has just named would hold among the logins it stands beside: one past every one of
 * them numbered below it. Null where the name it answered numbers nothing, which leaves the name standing. */
export function nextLoginNumber(peers: readonly LoginRow[], name: string): number | null {
  const named = namedLoginNumber(name);

  if (named === null) return null;

  const below = peers.filter((one) => {
    const own = namedLoginNumber(one.name);

    return own !== null && own < named;
  }).length;

  return below + 1;
}

/** What a screen calls a login: its number within the account that owns it, in the pack's words, or the name it is
 * stored under where no number was counted for it. */
export function loginText(t: Translate, name: string, number: number | null | undefined): string {
  return number === null || number === undefined ? name : t("supply.label.login_numbered", { number: String(number).padStart(2, "0") });
}
