import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";

import { SECRET_INPUTS } from "#shared/secret-kinds";
import { SECRET_NAME_MAX } from "#shared/secrets";
import { wording } from "#shared/wording";

import type { SecretField, SecretInput, SecretKind } from "#shared/secret-kinds";

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
