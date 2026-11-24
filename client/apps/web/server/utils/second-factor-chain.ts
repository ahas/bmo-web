import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, resolveChain, setChainDelegation, setChainValue } from "./account-service";
import { unitNamed } from "./chain-names";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";

import type { SignedIn } from "./accounts";
import type { ChainDelegation } from "#shared/organisation-supply";
import type { SecondFactorRequirement } from "#shared/account-security";

// Whether an organisation asks a second factor of its people (docs/web.md, 「Organisation」, the security tab;
// docs/accounts.md, 「The second factor」): the account service's own kind on the delegation chain, read and written at
// one link — a unit's or the platform's — as the signed-in login.

/** The chain's kind, as the account service declares it. */
const KIND = "account.second-factor-required";

const CODES: Readonly<Record<string, string>> = {
  locked: "org_storage.error.locked",
  forbidden: "security.error.forbidden",
  "bad-request": "security.error.failed"
};

/** What a call came to, in the pack's words. */
export function requirementFailure(error: unknown): Error {
  return organizationFailure(error, CODES);
}

/** The link a node names: a unit's, or the platform's. */
export function requirementLink(unit: number | null): string {
  return unit === null ? "platform" : `unit:${unit}`;
}

/** The requirement at a link as the reader stands to it. */
export async function requirementAt(unit: number | null, signed: SignedIn): Promise<SecondFactorRequirement> {
  const link = requirementLink(unit);
  let entry;

  try {
    entry = await chainEntry(KIND, link, callerOf(signed));
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 403) throw fail(403, wording("security.error.forbidden"));

    throw error;
  }

  const own = typeof entry.value === "boolean" ? entry.value : null;
  const stands = unit === null ? own === true : (await resolveChain(KIND, { unit })).value === true;

  return {
    own,
    stands,
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null,
    locker: await unitNamed(entry.lockedBy)
  };
}

/** The requirement's value at a link, null to follow above, and its delegation, either or both. */
export async function changeRequirement(unit: number | null, change: { value?: boolean | null; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  const link = requirementLink(unit);

  if (change.value !== undefined) await setChainValue(KIND, link, change.value, callerOf(signed));
  if (change.delegation !== undefined) await setChainDelegation(KIND, link, change.delegation, callerOf(signed));
}
