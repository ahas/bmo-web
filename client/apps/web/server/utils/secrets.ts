import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";

import { SECRET_NAME_MAX } from "#shared/secrets";
import { wording } from "#shared/wording";

// The secret store's refusals as the console says them (docs/web.md, 「Settings」, the secret store section): the
// server's codes (docs/boundary.md, 「The secret store」) to the pack's keys. No refusal of the server carries a
// value, and none of these sentences does either; nothing here logs.

const SECRET_CODES: Record<string, string> = {
  "bad-name": "secrets.error.bad_name",
  "empty-value": "secrets.error.empty_value",
  "secret-exists": "secrets.error.exists",
  "not-a-file": "secrets.error.not_a_file",
  "not-found": "secrets.error.not_found",
  "no-secret-store": "secrets.error.no_store",
  "not-in-force": "secrets.error.not_in_force",
  forbidden: "common.error.administrator_only"
};

/** What a call on the store came to, said in the pack's words: `otherwise` where the code stands in no row. */
export function secretFailure(error: unknown, otherwise: string): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("secrets.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = SECRET_CODES[error.code];

    return key === undefined ? fail(502, wording(otherwise)) : fail(error.status, wording(key, { max: SECRET_NAME_MAX }));
  }

  return fail(500, wording(otherwise));
}
