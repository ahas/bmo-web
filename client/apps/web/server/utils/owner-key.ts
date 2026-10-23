import { useWebSql } from "./db";

import type { SignedIn } from "./accounts";

// The owner a unit acts for, as the console hands it on (docs/boundary.md, 「Calls the console makes」): the
// header `Owner-Key`, holding the signed-in login's user on the account service, its id written as a decimal
// number. The browser never chooses it: the console sets it on every call and socket it relays, in place of any
// the browser sent. A login with no user carries none.

export const OWNER_KEY_HEADER = "owner-key";

/** The owner key of a signed-in login, or null where the login has no user. */
export function ownerKeyOf(signed: SignedIn): string | null {
  return signed.id === null ? null : String(signed.id);
}

/** The platform administrator's owner key, for a read the console makes for nobody signed in; null before the
 * account model names an administrator. */
export async function administratorKey(): Promise<string | null> {
  const row = await useWebSql().get("SELECT bmo_administrator() AS id") as { id: number | string | null } | null;

  return row === null || row.id === null ? null : String(row.id);
}
