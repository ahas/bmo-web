import { fail } from "./fail";

import { wording } from "#shared/wording";

// A company's own lists as the console hands them on (docs/web.md, 「System and organisation」, its roles and kinds tab): each
// entry a key and a name, in the list's order. Their shape is the account service's to judge; a body that is no such
// list is refused here.

/** The entries a request names, each a key and a name; a refusal where it names something else. */
export function catalogueOf(asked: unknown): { key: string; name: string }[] {
  if (!Array.isArray(asked)) throw fail(400, wording("organization.error.bad_request"));

  return asked.map((entry: { key?: unknown; name?: unknown } | null) => {
    if (typeof entry?.key !== "string" || typeof entry.name !== "string") throw fail(400, wording("organization.error.bad_request"));

    return { key: entry.key, name: entry.name };
  });
}
