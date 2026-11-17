import { ownerKeyOf, ownerRoleOf } from "./owner-key";

import type { SignedIn } from "./accounts";
import type { ProfileCaller } from "./account-service";
import type { ProfileAsk } from "#shared/types";

/** The user a profile route names, or null where its path is no user's id. */
export function profileUser(param: string | undefined): number | null {
  const text = (param ?? "").trim();
  const user = Number(text);

  return /^\d+$/.test(text) && Number.isSafeInteger(user) && user > 0 ? user : null;
}

/** Whether the signed-in login may keep the profile of `user`: the account's holder or an administrator. */
export function mayKeepProfile(signed: SignedIn, user: number): boolean {
  return signed.administrator || signed.id === user;
}

/**
 * The login a profile call is made as, as the service reads it: its user id and role. A console login before the
 * model carries no user, and its administrator's role alone carries the call.
 */
export function profileCaller(signed: SignedIn): ProfileCaller {
  return { key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) };
}

/**
 * A profile as a request sent it, each field a string that may be empty, the rank and the duty only where sent;
 * null where one does not read as one.
 */
export function profileAsked(body: unknown): ProfileAsk | null {
  if (typeof body !== "object" || body === null) return null;

  const held = body as Record<string, unknown>;
  const text = (name: string): string | null => (typeof held[name] === "string" ? (held[name] as string).trim() : null);
  const fullName = text("fullName");
  const jobTitle = text("jobTitle");
  const landline = text("landline");
  const mobile = text("mobile");
  const email = text("email");

  if (fullName === null || jobTitle === null || landline === null || mobile === null || email === null) return null;

  const asked: ProfileAsk = { fullName, jobTitle, landline, mobile, email };

  for (const name of ["rank", "duty"] as const) {
    if (held[name] === undefined) continue;

    const value = text(name);

    if (value === null) return null;
    asked[name] = value;
  }

  return asked;
}
