import { isError } from "h3";

import { wording } from "#shared/wording";

import { AccountRefusal, AccountServiceDown, permissionTreeOf } from "./account-service";
import { fail } from "./fail";

import type { H3Event } from "h3";

// What the console's BMO profile routes share (docs/web.md, 「Organisation」, its BMO tab, and 「Settings」, its own-BMO
// section): the account service's refusals (docs/accounts.md, 「A person's BMO profile」) said in the pack's words, a
// picture read off a form, and the people an act reaches, whose BMOs then take the profile standing for them.

const CODES: Readonly<Record<string, string>> = {
  "personalize-withheld": "bmo_profile.error.withheld",
  "bad-agent-profile": "bmo_profile.error.bad_profile",
  "not-a-picture": "picture.error.not_a_picture",
  "picture-too-large": "picture.error.too_large",
  forbidden: "bmo_profile.error.forbidden",
  "not-found": "bmo_profile.error.not_found"
};

/** The account service's answer on a profile route said in the pack's words; a refusal already said is handed on. */
export function bmoFailure(error: unknown): Error {
  if (isError(error)) return error;

  if (error instanceof AccountServiceDown) return fail(503, wording("bmo_profile.error.failed"));

  if (error instanceof AccountRefusal) {
    const key = CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "bmo_profile.error.failed"));
  }

  return fail(500, wording("bmo_profile.error.failed"));
}

/** The picture a form's `picture` part carries, its bytes and the type the browser named. */
export async function pictureForm(event: H3Event): Promise<{ bytes: Uint8Array; type: string }> {
  const picture = ((await readMultipartFormData(event)) ?? []).find((part) => part.name === "picture" && part.filename !== undefined);

  if (picture === undefined) throw fail(400, wording("picture.error.not_a_picture"));

  return { bytes: new Uint8Array(picture.data), type: picture.type ?? "application/octet-stream" };
}

/** Every person standing in a unit or a unit below it, read as the administrator, so a change of the unit's default
 * or permission reaches each of their BMOs. */
export async function peopleUnder(unit: number): Promise<number[]> {
  const tree = await permissionTreeOf(unit);

  return tree.people.map((person) => Number(person.user)).filter((user) => Number.isSafeInteger(user));
}

/** A whole-number id from a route's path, refused where it is none. */
export function idParam(event: H3Event, name: string): number {
  const raw = getRouterParam(event, name) ?? "";

  if (!/^\d+$/.test(raw)) throw fail(400, wording("common.error.bad_action"));

  return Number(raw);
}
