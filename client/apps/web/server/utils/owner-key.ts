import { useWebSql } from "./db";

import type { SignedIn } from "./accounts";

// The owner a unit acts for, as the console hands it on (docs/boundary.md, 「Calls the console makes」): the
// header `Owner-Key`, holding the signed-in login's user on the account service, its id written as a decimal
// number, and the header `Owner-Role`, `administrator` or `member`, what that login is on the platform. The
// browser never chooses either: the console sets them on every call and socket it relays, in place of any the
// browser sent. A login with no user carries no key, and still its role.

export const OWNER_KEY_HEADER = "owner-key";
export const OWNER_ROLE_HEADER = "owner-role";

/** The role a signed-in login acts in. */
export function ownerRoleOf(signed: SignedIn): "administrator" | "member" {
  return signed.administrator ? "administrator" : "member";
}

/** The owner headers a signed-in login's call is handed on with. */
export function ownerHeaders(signed: SignedIn): Record<string, string> {
  const key = ownerKeyOf(signed);

  return { ...(key === null ? {} : { [OWNER_KEY_HEADER]: key }), [OWNER_ROLE_HEADER]: ownerRoleOf(signed) };
}

/** The owner key of a signed-in login, or null where the login has no user. */
export function ownerKeyOf(signed: SignedIn): string | null {
  return signed.id === null ? null : String(signed.id);
}

/**
 * The move's administrator's owner key: the one user the data move made the administrator, written once and changed by
 * no route (docs/accounts.md, 「The platform administrators」); null before the account model names one. It anchors the
 * owner's account and stands for the console's own reads made for nobody signed in. Whether a signed-in user is a
 * platform administrator is never read off it: that is the account service's word for each user.
 */
export async function moveAdministratorKey(): Promise<string | null> {
  const row = await useWebSql().get("SELECT bmo_administrator() AS id") as { id: number | string | null } | null;

  return row === null || row.id === null ? null : String(row.id);
}
