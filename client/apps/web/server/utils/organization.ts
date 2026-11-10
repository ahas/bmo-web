import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";
import { ownerKeyOf, ownerRoleOf } from "./owner-key";

import { wording } from "#shared/wording";

import type { ProfileCaller } from "./account-service";
import type { SignedIn } from "./accounts";

// The organisation section's calls and refusals (docs/web.md, 「Settings」, the organisation section): the administrator's login handed on,
// and the account service's codes (docs/boundary.md, 「Organisation units」) said in the pack's words.

const ORGANIZATION_CODES: Record<string, string> = {
  "other-company": "organization.error.other_company",
  cycle: "organization.error.cycle",
  "not-found": "organization.error.not_found",
  "bad-request": "organization.error.bad_request",
  forbidden: "common.error.administrator_only"
};

/** The login a section's call is made for. */
export function callerOf(signed: SignedIn): ProfileCaller {
  return { key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) };
}

/** What a call came to, said in the pack's words. */
export function organizationFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("organization.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = ORGANIZATION_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "organization.error.failed"));
  }

  return fail(500, wording("organization.error.failed"));
}

/** A whole number a path or a body names, or a refusal saying it names none. */
export function unitNumber(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isInteger(number) || number <= 0) throw fail(400, wording("organization.error.bad_request"));

  return number;
}
