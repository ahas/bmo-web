import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";
import { ownerKeyOf } from "./owner-key";

import { SECRET_INPUTS } from "#shared/secret-kinds";
import { SECRET_NAME_MAX } from "#shared/secrets";
import { wording } from "#shared/wording";

import type { SecretField, SecretInput, SecretKind } from "#shared/secret-kinds";
import type { SignedIn } from "./accounts";

// The secret store's refusals as the console says them (docs/web.md, the secret store section): the server's codes
// (docs/boundary.md, 「The secret store」, 「Secret kinds」) to the pack's keys. No refusal of the server carries a
// value, and none of these sentences does either; nothing here logs.

const SECRET_CODES: Record<string, string> = {
  "bad-name": "secrets.error.bad_name",
  "bad-value": "secrets.error.bad_value",
  "empty-value": "secrets.error.empty_value",
  "secret-exists": "secrets.error.exists",
  "not-a-file": "secrets.error.not_a_file",
  "not-found": "secrets.error.not_found",
  "no-secret-store": "secrets.error.no_store",
  "not-in-force": "secrets.error.not_in_force",
  "bad-kind": "secrets.error.bad_kind",
  "kind-exists": "secrets.error.kind_exists",
  forbidden: "secrets.error.not_yours"
};

/**
 * A signed-in login's own secret space, as the user its calls are handed on with (docs/web.md, the secret store
 * section): every login with a user holds one, the administrator's the store's own folder. A login with no user, a
 * console account before the account model is in force, holds none; `null` for it.
 */
export function secretSpaceOf(signed: SignedIn): string | null {
  return ownerKeyOf(signed);
}

/** A signed-in login's own secret space, a login that holds none refused. */
export function requireSecretSpace(signed: SignedIn): string {
  const user = secretSpaceOf(signed);

  if (user === null) throw fail(403, wording("secrets.error.no_space"));

  return user;
}

/** What a call on the store came to, said in the pack's words: `otherwise` where the code stands in no row. */
export function secretFailure(error: unknown, otherwise: string): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("secrets.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = SECRET_CODES[error.code];

    return key === undefined ? fail(502, wording(otherwise)) : fail(error.status, wording(key, { max: SECRET_NAME_MAX }));
  }

  return fail(500, wording(otherwise));
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function fieldOf(value: unknown): SecretField {
  const field = record(value);
  const input = SECRET_INPUTS.find((one) => one === field.input);

  if (input === undefined) throw fail(400, wording("secrets.error.bad_kind"));

  return { key: text(field.key), label: text(field.label), masked: field.masked === true, input: input as SecretInput, required: field.required === true };
}

/** A kind read out of a request's body in its own shape, the server holding it to the kind's rules. */
export function kindOfBody(body: unknown): SecretKind {
  const kind = record(body);

  if (!Array.isArray(kind.fields)) throw fail(400, wording("secrets.error.bad_kind"));

  return { key: text(kind.key), name: text(kind.name), description: text(kind.description), fields: kind.fields.map(fieldOf) };
}

/** The registry's kinds a `secret.kinds` resolution leaves offered to one link (docs/accounts.md, 「Secret kinds」):
 * where it named keys, those and no others, in the order they were added; where it said nothing, `value` holds no
 * list and every kind stands, exactly as the store's own write check reads it. */
export function offeredKinds(kinds: readonly SecretKind[], value: unknown): SecretKind[] {
  if (!Array.isArray(value)) return [...kinds];

  const offered = new Set(value.filter((one): one is string => typeof one === "string"));

  return kinds.filter((kind) => offered.has(kind.key));
}
